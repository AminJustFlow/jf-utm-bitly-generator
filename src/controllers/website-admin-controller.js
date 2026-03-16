import { NodeResponse } from "../http/response.js";
import { validateWebsiteRegistrationPayload } from "../domain/tracking-payloads.js";
import { renderAppHeader, renderAppShellStyles } from "./app-shell.js";

export class WebsiteAdminController {
  constructor({
    websiteAdministrationService,
    rulesService = null
  }) {
    this.websiteAdministrationService = websiteAdministrationService;
    this.rulesService = rulesService;
  }

  async handleHtml() {
    const clients = mergeClientOptions({
      trackedClients: this.websiteAdministrationService.listClients(),
      catalogClients: this.rulesService?.createFormCatalog?.() ?? []
    });
    const clientGroups = this.websiteAdministrationService.listDashboardData();
    const websiteEntries = clientGroups.flatMap((group) => group.websites);
    const thresholds = this.websiteAdministrationService.healthThresholds();
    const summary = {
      totalClients: clientGroups.length,
      totalWebsites: websiteEntries.length,
      healthyWebsites: websiteEntries.filter((entry) => entry.health.status === "healthy").length,
      staleWebsites: websiteEntries.filter((entry) => entry.health.status === "stale").length,
      misconfiguredWebsites: websiteEntries.filter((entry) => entry.health.status === "misconfigured").length,
      failingWebsites: websiteEntries.filter((entry) => entry.health.status === "failing").length,
      warningWebsites: websiteEntries.filter((entry) => entry.health.warnings.length > 0).length,
      recentAuthFailures: websiteEntries.reduce((sum, entry) => sum + Number(entry.health.recent_auth_failure_count ?? 0), 0),
      recentIngestionFailures: websiteEntries.reduce((sum, entry) => sum + Number(entry.health.recent_ingestion_failure_count ?? 0), 0),
      activeWebsites: websiteEntries.filter((entry) => entry.website.status === "active").length,
      disabledWebsites: websiteEntries.filter((entry) => entry.website.status === "disabled").length,
      multisiteWebsites: websiteEntries.filter((entry) => entry.website.wordpress.multisite_enabled).length,
      totalInstallations: websiteEntries.reduce((sum, entry) => sum + entry.installation_count, 0)
    };

    return NodeResponse.text(renderHtml({ clients, clientGroups, summary, thresholds }), 200, {
      "Content-Type": "text/html; charset=utf-8"
    });
  }

  async handleCreate(request) {
    const parsedBody = request.parseJson();
    if (!parsedBody.ok) {
      return badRequest(parsedBody.errorCode, parsedBody.errorMessage);
    }

    const validated = validateWebsiteRegistrationPayload(parsedBody.value);
    if (!validated.ok) {
      return badRequest(validated.code, validated.message);
    }

    try {
      const result = this.websiteAdministrationService.createWebsite(validated.value);

      return NodeResponse.json({
        status: "ok",
        website: result.website,
        public_key: result.public_key,
        secret_key: result.secret_key
      }, 201);
    } catch (error) {
      if (error.code === "missing_tracking_encryption_key") {
        return NodeResponse.json({
          status: "error",
          error: {
            code: error.code,
            message: error.message
          }
        }, 503);
      }

      if (error instanceof TypeError) {
        return badRequest("invalid_base_url", "base_url must be a valid absolute URL.");
      }

      return adminError(error);
    }
  }

  async handleRotate(request) {
    const parsedBody = request.parseJson();
    if (!parsedBody.ok) {
      return badRequest(parsedBody.errorCode, parsedBody.errorMessage);
    }

    const websiteId = positiveInteger(parsedBody.value.website_id);
    if (!websiteId) {
      return badRequest("invalid_website_id", "website_id must be a positive integer.");
    }

    try {
      const result = this.websiteAdministrationService.rotateCredentials(websiteId);
      return NodeResponse.json({
        status: "ok",
        website: result.website,
        public_key: result.public_key,
        secret_key: result.secret_key
      });
    } catch (error) {
      return adminError(error);
    }
  }

  async handleStatus(request) {
    const parsedBody = request.parseJson();
    if (!parsedBody.ok) {
      return badRequest(parsedBody.errorCode, parsedBody.errorMessage);
    }

    const websiteId = positiveInteger(parsedBody.value.website_id);
    if (!websiteId) {
      return badRequest("invalid_website_id", "website_id must be a positive integer.");
    }

    try {
      const website = this.websiteAdministrationService.updateWebsiteStatus(
        websiteId,
        String(parsedBody.value.status ?? "").trim().toLowerCase()
      );

      return NodeResponse.json({
        status: "ok",
        website
      });
    } catch (error) {
      return adminError(error);
    }
  }
}

function badRequest(code, message) {
  return NodeResponse.json({
    status: "error",
    error: {
      code,
      message
    }
  }, 400);
}

function adminError(error) {
  if (error.code === "website_not_found") {
    return NodeResponse.json({
      status: "error",
      error: {
        code: error.code,
        message: error.message
      }
    }, 404);
  }

  if (error.code === "invalid_website_status") {
    return badRequest(error.code, error.message);
  }

  return NodeResponse.json({
    status: "error",
    error: {
      code: "website_admin_failed",
      message: error.message
    }
  }, 500);
}

function positiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function renderHtml(view) {
  const { clients, clientGroups, summary, thresholds } = view;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Website Admin</title>
  <style>
    :root{--bg:#f4efe5;--panel:rgba(255,250,242,.94);--panel-strong:rgba(255,255,255,.88);--ink:#17302a;--muted:#66766f;--accent:#0d6c5e;--danger:#b4432b;--line:rgba(23,48,42,.1);--shadow:0 24px 60px rgba(20,32,31,.09)}
    *{box-sizing:border-box} body{margin:0;color:var(--ink);font-family:"Aptos","Segoe UI",sans-serif;background:radial-gradient(circle at top left,rgba(13,108,94,.18),transparent 32rem),radial-gradient(circle at top right,rgba(183,142,65,.12),transparent 26rem),linear-gradient(180deg,#faf7f1 0%,var(--bg) 100%)}
    .shell{max-width:1500px;margin:0 auto;padding:1.4rem 1rem 3rem}
    ${renderAppShellStyles()}
    .hero,.panel,.card{background:var(--panel);border:1px solid var(--line);border-radius:1.35rem;box-shadow:var(--shadow)}
    .hero,.panel{padding:1rem 1.05rem;margin-bottom:1rem}
    .hero-top,.panel-head,.client-head,.stats,.actions,.chips,.client-metrics,.website-card-meta,.website-actions{display:flex;gap:1rem;flex-wrap:wrap}
    .hero-top,.panel-head,.client-head{justify-content:space-between;align-items:flex-end}
    h1,h2,h3,h4{margin:0;font-family:"Aptos Display","Trebuchet MS",sans-serif}
    h1{font-size:clamp(2.1rem,4.8vw,3.2rem);letter-spacing:-.05em;line-height:.96}
    h2{font-size:1.35rem;letter-spacing:-.04em}
    h3{font-size:1.28rem;letter-spacing:-.04em}
    h4{font-size:1rem}
    .lede,.meta,.muted,.empty{color:var(--muted);line-height:1.5}
    .stats{margin-top:.4rem}
    .stat,.client-metric{min-width:11rem;padding:.95rem 1rem;border:1px solid var(--line);border-radius:1.05rem;background:var(--panel-strong)}
    .stat strong,.client-metric strong{display:block;font-size:1.68rem;letter-spacing:-.05em}
    .panel-grid{display:grid;gap:1rem;grid-template-columns:minmax(0,1fr);align-items:start}
    .panel-grid.has-secret{grid-template-columns:minmax(24rem,1.15fr) minmax(20rem,.85fr)}
    .meta-grid,.website-grid{display:grid;gap:.85rem}
    .meta-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
    .website-grid{grid-template-columns:repeat(auto-fit,minmax(21rem,1fr))}
    #website-create-form{display:grid;gap:1rem;align-content:start}
    .client-grid,.form-grid-three,.form-grid-four{display:grid;gap:.85rem}
    .client-grid{grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
    .form-grid-three{grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
    .form-grid-four{grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))}
    label{display:grid;gap:.35rem;font-size:.9rem;color:var(--muted)}
    input,select{width:100%;padding:.78rem .9rem;border:1px solid rgba(23,48,42,.14);border-radius:.95rem;background:rgba(255,255,255,.86);color:var(--ink);font:inherit}
    .button,.mini-button,.danger-button{display:inline-flex;align-items:center;justify-content:center;min-height:2.8rem;padding:.78rem 1rem;border-radius:999px;border:1px solid var(--line);font:inherit;cursor:pointer;background:rgba(255,255,255,.72);color:var(--ink)}
    .button{background:var(--accent);border-color:transparent;color:#fff;box-shadow:0 12px 24px rgba(13,108,94,.18)}
    .mini-button,.danger-button{min-height:2.2rem;padding:.45rem .8rem;font-size:.84rem}
    .danger-button{background:#fff3f0;border-color:rgba(180,67,43,.22);color:var(--danger)}
    .chip{display:inline-flex;align-items:center;padding:.38rem .74rem;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.72);font-size:.82rem}
    .chip.success{background:#ecfaf4;color:#18734c}
    .chip.warn{background:#fff7e7;color:#8b6421}
    .chip.error{background:#fff3f0;color:var(--danger)}
    .client-section{display:grid;gap:1rem}
    .card{padding:1rem;display:grid;gap:1rem;background:linear-gradient(180deg,rgba(255,255,255,.82),rgba(255,249,240,.92))}
    .website-card-top{display:grid;gap:1rem;grid-template-columns:minmax(0,1fr) auto;align-items:start}
    .website-card-intro{display:grid;gap:.35rem}
    .website-card-meta{gap:.55rem}
    .website-actions{justify-content:flex-end;align-items:center;gap:.65rem}
    .website-meta-grid{display:grid;gap:.85rem;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))}
    .meta-tile,.table-card,.secret-panel,.context-panel{padding:.85rem .9rem;border:1px solid var(--line);border-radius:1rem;background:rgba(255,255,255,.76)}
    .meta-tile strong,.context-panel strong{display:block;font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.35rem}
    .context-panel{display:grid;gap:.75rem}
    .context-value,.meta-value{display:block;line-height:1.5;word-break:break-word}
    .meta-tile code,.table-card code{display:block;line-height:1.5;word-break:break-all}
    .tables{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(20rem,1fr));align-items:start}
    .table-card{display:grid;gap:.75rem;min-width:0}
    .table-card h4{margin:0}
    .table-scroll{overflow:auto}
    table{width:100%;border-collapse:collapse;font-size:.9rem}
    th,td{text-align:left;padding:.55rem .35rem;border-bottom:1px dashed rgba(23,48,42,.12);vertical-align:top}
    th{font-size:.76rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
    tr:last-child td{border-bottom:0}
    code,pre{font-family:"Aptos Mono","Cascadia Code","Consolas",monospace}
    .secret-panel{display:none;gap:.55rem}
    .secret-panel.visible{display:grid}
    .secret-panel pre{margin:0;padding:.75rem .8rem;border-radius:.9rem;background:#13211d;color:#f8f4ec;overflow:auto}
    .status{min-height:1.2rem;font-size:.88rem;color:var(--muted);align-self:center}
    .status.error{color:var(--danger)}
    .status.success{color:var(--accent)}
    .empty{padding:2.6rem 1rem;text-align:center;border:1px dashed rgba(23,48,42,.16);border-radius:1.2rem;background:rgba(255,255,255,.55)}
    [hidden]{display:none!important}
    @media (max-width:1180px){.panel-grid.has-secret,.meta-grid,.form-grid-three,.form-grid-four{grid-template-columns:1fr}}
    @media (max-width:900px){.website-card-top{grid-template-columns:1fr}.website-actions{justify-content:flex-start}}
    @media (max-width:640px){.shell{padding-inline:.85rem}.hero,.panel,.card{border-radius:1rem}}
  </style>
</head>
<body>
  <main class="shell">
    ${renderAppHeader("websites")}
    <section class="hero">
      <div class="hero-top">
        <div>
          <h1>Website Admin</h1>
          <p class="lede">Provision websites under shared clients, inspect operational health, and catch stale, misconfigured, or failing plugin installations before reporting silently drifts.</p>
          <p class="meta">Stale after ${thresholds.stale_hours}h. Heartbeat gaps warn after ${thresholds.heartbeat_gap_hours}h. Traffic gaps warn after ${thresholds.traffic_gap_hours}h.</p>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><strong>${summary.totalClients}</strong><span>Clients</span></div>
        <div class="stat"><strong>${summary.totalWebsites}</strong><span>Websites</span></div>
        <div class="stat"><strong>${summary.healthyWebsites}</strong><span>Healthy</span></div>
        <div class="stat"><strong>${summary.staleWebsites}</strong><span>Stale</span></div>
        <div class="stat"><strong>${summary.misconfiguredWebsites}</strong><span>Misconfigured</span></div>
        <div class="stat"><strong>${summary.failingWebsites}</strong><span>Failing</span></div>
        <div class="stat"><strong>${summary.warningWebsites}</strong><span>With Warnings</span></div>
        <div class="stat"><strong>${summary.recentAuthFailures}</strong><span>Recent Auth Failures</span></div>
        <div class="stat"><strong>${summary.recentIngestionFailures}</strong><span>Recent Ingestion Failures</span></div>
        <div class="stat"><strong>${summary.totalInstallations}</strong><span>Known Installs</span></div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Create Website</h2>
          <div class="meta">Each website keeps its own credentials, config, telemetry, and multisite context. The plain secret is only shown in the immediate response.</div>
        </div>
      </div>
      <div class="panel-grid" id="website-create-layout">
        <form id="website-create-form">
          <div class="context-panel">
            <div>
              <strong>Client Selection</strong>
              <div class="meta">Choose an existing client from the approved or previously tracked list, or type a new client name. Typing a new client clears the existing selection automatically.</div>
            </div>
            <div class="client-grid">
              <label>Choose Existing Client<select name="existing_client_name" id="existing-client-name"><option value="">${clients.length === 0 ? "No clients available yet" : "Select an existing client"}</option>${clients.map((client) => `<option value="${escapeHtml(client.client_name)}">${escapeHtml(client.client_name)}</option>`).join("")}</select></label>
              <label>Add New Client<input name="manual_client_name" id="manual-client-name" placeholder="Type a new client name"></label>
            </div>
          </div>
          <div class="form-grid-three">
            <label>Website Name<input name="website_name" required></label>
            <label>Base URL<input name="base_url" type="url" required placeholder="https://example.com"></label>
            <label>Environment<select name="environment"><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option></select></label>
          </div>
          <div class="form-grid-four">
            <label>Platform<select name="platform_type" id="platform-type"><option value="wordpress">WordPress</option><option value="headless">Headless</option><option value="custom">Custom</option></select></label>
            <label>Status<select name="status"><option value="active">Active</option><option value="disabled">Disabled</option></select></label>
            <label>Session Timeout<input name="session_timeout_minutes" type="number" min="1" value="30"></label>
            <label>Cookie Retention<input name="cookie_retention_days" type="number" min="1" value="90"></label>
          </div>
          <div class="context-panel" id="wordpress-context-panel" style="margin-top:1rem">
            <div>
              <strong>WordPress Context</strong>
              <div class="meta">Use these fields when the monitored site belongs to a multisite network or when you already know the network and site identifiers.</div>
            </div>
            <div class="meta-grid">
              <label>Site Mode<select name="wp_multisite_enabled" id="wp-multisite-enabled"><option value="false">Single Site</option><option value="true">Multisite</option></select></label>
              <label data-multisite-only>Network ID<input name="wp_network_id" placeholder="network-1"></label>
              <label data-multisite-only>Network Name<input name="wp_network_name" placeholder="Client Network"></label>
              <label>Site ID<input name="wp_site_id" placeholder="42"></label>
            </div>
            <div class="meta-grid">
              <label>Site Path<input name="wp_site_path" placeholder="/subsite/"></label>
            </div>
          </div>
          <div class="actions" style="margin-top:1rem">
            <button class="button" type="submit">Create Website</button>
            <div class="status" id="website-create-status"></div>
          </div>
        </form>
        <aside class="secret-panel" id="credential-output">
          <strong>Latest Credentials</strong>
          <div class="meta">Copy these now. They will not be rendered again.</div>
          <pre id="credential-output-text"></pre>
        </aside>
      </div>
    </section>
    <section style="display:grid;gap:1rem">
      ${clientGroups.length === 0 ? `<div class="empty">No websites have been provisioned yet.</div>` : clientGroups.map(renderClientGroup).join("")}
    </section>
  </main>
  <script>
    (() => {
      const output = document.getElementById("credential-output");
      const outputText = document.getElementById("credential-output-text");
      const createLayout = document.getElementById("website-create-layout");
      const createForm = document.getElementById("website-create-form");
      const createStatus = document.getElementById("website-create-status");
      const existingClientInput = document.getElementById("existing-client-name");
      const manualClientInput = document.getElementById("manual-client-name");
      const platformTypeInput = document.getElementById("platform-type");
      const multisiteInput = document.getElementById("wp-multisite-enabled");
      const wordpressContextPanel = document.getElementById("wordpress-context-panel");
      const multisiteOnlyFields = document.querySelectorAll("[data-multisite-only]");

      function syncWordpressForm() {
        const isWordpress = platformTypeInput.value === "wordpress";
        const isMultisite = multisiteInput.value === "true";
        wordpressContextPanel.hidden = !isWordpress;
        multisiteOnlyFields.forEach((field) => {
          field.hidden = !isWordpress || !isMultisite;
        });
      }

      function showCredentialResult(body) {
        createLayout.classList.add("has-secret");
        output.classList.add("visible");
        outputText.textContent = JSON.stringify({
          website: body.website,
          public_key: body.public_key,
          secret_key: body.secret_key
        }, null, 2);
        output.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }

      async function postJson(url, payload) {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        if (!response.ok || body.status !== "ok") {
          throw new Error(body && body.error && body.error.message ? body.error.message : "Request failed.");
        }
        return body;
      }

      existingClientInput.addEventListener("change", () => {
        if (existingClientInput.value) {
          manualClientInput.value = "";
        }
      });
      manualClientInput.addEventListener("input", () => {
        if (manualClientInput.value.trim()) {
          existingClientInput.value = "";
        }
      });
      platformTypeInput.addEventListener("change", syncWordpressForm);
      multisiteInput.addEventListener("change", syncWordpressForm);
      syncWordpressForm();

      createForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const clientName = manualClientInput.value.trim() || existingClientInput.value.trim();
        if (!clientName) {
          createStatus.textContent = "Choose an existing client or enter a new client name.";
          createStatus.className = "status error";
          return;
        }
        createStatus.textContent = "Creating website...";
        createStatus.className = "status";
        const formData = new FormData(createForm);
        const payload = {
          client_name: clientName,
          website_name: formData.get("website_name"),
          base_url: formData.get("base_url"),
          platform_type: formData.get("platform_type"),
          environment: formData.get("environment"),
          status: formData.get("status"),
          config_json: {
            session_timeout_minutes: Number(formData.get("session_timeout_minutes") || 30),
            cookie_retention_days: Number(formData.get("cookie_retention_days") || 90)
          },
          wordpress: formData.get("platform_type") === "wordpress" ? {
            multisite_enabled: formData.get("wp_multisite_enabled") === "true",
            network_id: formData.get("wp_network_id"),
            network_name: formData.get("wp_network_name"),
            site_id: formData.get("wp_site_id"),
            site_path: formData.get("wp_site_path")
          } : null
        };

        try {
          const body = await postJson("/admin/websites", payload);
          createStatus.textContent = "Website created. Credentials are shown on the right.";
          createStatus.className = "status success";
          showCredentialResult(body);
          createForm.reset();
          syncWordpressForm();
        } catch (error) {
          createStatus.textContent = error.message;
          createStatus.className = "status error";
        }
      });

      document.addEventListener("click", async (event) => {
        const rotateButton = event.target.closest("[data-rotate-website-id]");
        if (rotateButton) {
          rotateButton.disabled = true;
          try {
            const body = await postJson("/admin/websites/rotate", {
              website_id: rotateButton.getAttribute("data-rotate-website-id")
            });
            showCredentialResult(body);
          } catch (error) {
            window.alert(error.message);
          } finally {
            rotateButton.disabled = false;
          }
          return;
        }

        const statusButton = event.target.closest("[data-status-website-id]");
        if (!statusButton) {
          return;
        }

        statusButton.disabled = true;
        try {
          await postJson("/admin/websites/status", {
            website_id: statusButton.getAttribute("data-status-website-id"),
            status: statusButton.getAttribute("data-next-status")
          });
          window.location.reload();
        } catch (error) {
          window.alert(error.message);
          statusButton.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>`;
}

function renderClientGroup(group) {
  return `<section class="panel client-section">
    <div class="client-head">
      <div>
        <div class="meta">Client</div>
        <h2>${escapeHtml(group.client?.client_name ?? "Unassigned Client")}</h2>
        <div class="muted">${group.website_count} websites - ${group.installation_count} installs - ${group.multisite_website_count} multisite</div>
      </div>
      <div class="chips">
        <span class="chip${group.client?.status === "disabled" ? " error" : ""}">${escapeHtml(group.client?.status ?? "active")}</span>
        <span class="chip">${escapeHtml(group.active_website_count)} active sites</span>
        <span class="chip">${escapeHtml(group.active_installation_count)} active installs</span>
        <span class="chip success">${escapeHtml(group.healthy_website_count)} healthy</span>
        <span class="chip warn">${escapeHtml(group.stale_website_count)} stale</span>
        <span class="chip${group.failing_website_count > 0 ? " error" : ""}">${escapeHtml(group.failing_website_count)} failing</span>
      </div>
    </div>
    <div class="client-metrics">
      <div class="client-metric"><strong>${group.website_count}</strong><span>Tracked Websites</span></div>
      <div class="client-metric"><strong>${group.multisite_website_count}</strong><span>Multisite Websites</span></div>
      <div class="client-metric"><strong>${group.installation_count}</strong><span>Plugin Installations</span></div>
      <div class="client-metric"><strong>${group.auth_failure_count}</strong><span>Auth Failures</span></div>
      <div class="client-metric"><strong>${group.ingestion_failure_count}</strong><span>Ingestion Failures</span></div>
    </div>
    <div class="website-grid">
      ${group.websites.map(renderWebsiteCard).join("")}
    </div>
  </section>`;
}

function renderWebsiteCard(entry) {
  const website = entry.website;
  const health = entry.health;
  const latestInstallation = entry.latest_installation;
  const nextStatus = website.status === "active" ? "disabled" : "active";
  const latestInstallMarkup = latestInstallation
    ? `<code>${escapeHtml(latestInstallation.installation_id)}</code><span class="meta-value">Plugin ${escapeHtml(latestInstallation.plugin_version || "unknown")}</span>`
    : `<span class="meta-value">No installation telemetry yet.</span>`;

  return `<article class="card">
    <div class="website-card-top">
      <div class="website-card-intro">
        <div class="website-card-meta">
          <span class="chip">${escapeHtml(website.environment)}</span>
          <span class="chip">${escapeHtml(website.platform_type)}</span>
          <span class="chip">${escapeHtml(website.wordpress.multisite_enabled ? "multisite" : "single-site")}</span>
        </div>
        <h3>${escapeHtml(website.website_name)}</h3>
        <div class="muted">${escapeHtml(website.base_url)}</div>
      </div>
      <div class="website-actions">
        <span class="chip ${healthChipClass(health.status)}">${escapeHtml(healthStatusLabel(health.status))}</span>
        <span class="chip${website.status === "disabled" ? " error" : ""}">${escapeHtml(website.status)}</span>
        <span class="chip">Credentials v${escapeHtml(website.credentials_version ?? 1)}</span>
        <button class="mini-button" type="button" data-rotate-website-id="${website.id}">Rotate Credentials</button>
        <button class="${website.status === "active" ? "danger-button" : "mini-button"}" type="button" data-status-website-id="${website.id}" data-next-status="${nextStatus}">${website.status === "active" ? "Disable" : "Enable"}</button>
      </div>
    </div>
    ${health.warnings.length > 0 ? `<div class="chips">${health.warnings.map((warning) => `<span class="chip warn">${escapeHtml(warning.label)}</span>`).join("")}</div>` : ""}
    <div class="website-meta-grid">
      <div class="meta-tile"><strong>Health</strong><span class="meta-value">${escapeHtml(healthStatusLabel(health.status))}</span></div>
      <div class="meta-tile"><strong>Public Key</strong><code>${escapeHtml(website.public_key)}</code></div>
      <div class="meta-tile"><strong>Config / Plugin</strong><span class="meta-value">Config v${escapeHtml(website.config_version)}</span><span class="meta-value">Plugin ${escapeHtml(website.installed_plugin_version || "--")}</span></div>
      <div class="meta-tile"><strong>Last Seen</strong><span class="meta-value">${escapeHtml(formatDate(website.last_seen_at))}</span></div>
      <div class="meta-tile"><strong>Last Heartbeat</strong><span class="meta-value">${escapeHtml(formatDate(health.last_heartbeat_at))}</span></div>
      <div class="meta-tile"><strong>Last Event Batch</strong><span class="meta-value">${escapeHtml(formatDate(health.last_batch_received_at))}</span></div>
      <div class="meta-tile"><strong>Last Conversion</strong><span class="meta-value">${escapeHtml(formatDate(health.last_conversion_at))}</span></div>
      <div class="meta-tile"><strong>Auth Failures</strong><span class="meta-value">${health.auth_failure_count} total</span><span class="meta-value">${health.recent_auth_failure_count} recent</span></div>
      <div class="meta-tile"><strong>Ingestion Failures</strong><span class="meta-value">${health.ingestion_failure_count} total</span><span class="meta-value">${health.recent_ingestion_failure_count} recent</span></div>
      <div class="meta-tile"><strong>Latest Install</strong>${latestInstallMarkup}</div>
    </div>
    <div class="context-panel">
      <strong>WordPress Context</strong>
      <span class="context-value">${renderWebsiteContext(website.wordpress)}</span>
    </div>
    <div class="tables">
      <section class="table-card">
        <h4>Installations</h4>
        ${entry.installations.length === 0
    ? `<div class="meta">No batches or heartbeats have been received yet.</div>`
    : `<div class="table-scroll"><table><thead><tr><th>Installation</th><th>Health</th><th>Versions</th><th>Last Heartbeat</th><th>Last Batch</th><th>Last Config</th><th>Site Context</th></tr></thead><tbody>${entry.installations.map((installation) => `<tr><td><code>${escapeHtml(installation.installation_id)}</code></td><td><span class="chip ${healthChipClass(installation.health.status)}">${escapeHtml(healthStatusLabel(installation.health.status))}</span><span class="meta-value">Auth ${installation.health.auth_failure_count} - Ingest ${installation.health.ingestion_failure_count}</span></td><td><span class="meta-value">Plugin ${escapeHtml(installation.plugin_version || "--")}</span><span class="meta-value">WP ${escapeHtml(installation.wp_version || "--")} - PHP ${escapeHtml(installation.php_version || "--")}</span></td><td>${escapeHtml(formatDate(installation.last_heartbeat_at))}</td><td>${escapeHtml(formatDate(installation.last_batch_received_at))}</td><td>${escapeHtml(formatDate(installation.last_config_fetched_at))}</td><td>${renderInstallationContext(installation)}</td></tr>`).join("")}</tbody></table></div>`}
      </section>
      <section class="table-card">
        <h4>Installation History</h4>
        ${entry.installation_events.length === 0
    ? `<div class="meta">No installation history yet.</div>`
    : `<div class="table-scroll"><table><thead><tr><th>Type</th><th>Version</th><th>Status</th><th>Occurred</th></tr></thead><tbody>${entry.installation_events.map((row) => `<tr><td>${escapeHtml(row.event_type)}</td><td>${escapeHtml(row.plugin_version || "--")}</td><td>${escapeHtml(row.status || "--")}</td><td>${escapeHtml(formatDate(row.occurred_at))}</td></tr>`).join("")}</tbody></table></div>`}
      </section>
      <section class="table-card">
        <h4>Credential History</h4>
        ${entry.credential_events.length === 0
    ? `<div class="meta">No credential history yet.</div>`
    : `<div class="table-scroll"><table><thead><tr><th>Action</th><th>Version</th><th>Public Key</th><th>At</th></tr></thead><tbody>${entry.credential_events.map((row) => `<tr><td>${escapeHtml(row.action)}</td><td>v${escapeHtml(row.credentials_version)}</td><td><code>${escapeHtml(row.public_key)}</code></td><td>${escapeHtml(formatDate(row.created_at))}</td></tr>`).join("")}</tbody></table></div>`}
      </section>
      <section class="table-card">
        <h4>Operational Alerts</h4>
        ${entry.observability_events.length === 0
    ? `<div class="meta">No auth or ingestion failures have been recorded.</div>`
    : `<div class="table-scroll"><table><thead><tr><th>Type</th><th>Install</th><th>Code</th><th>Message</th><th>Occurred</th></tr></thead><tbody>${entry.observability_events.map((row) => `<tr><td>${escapeHtml(row.event_type)}</td><td>${escapeHtml(row.installation_id || "--")}</td><td>${escapeHtml(row.error_code || "--")}</td><td>${escapeHtml(row.message)}</td><td>${escapeHtml(formatDate(row.occurred_at))}</td></tr>`).join("")}</tbody></table></div>`}
      </section>
    </div>
  </article>`;
}

function renderWebsiteContext(wordpress) {
  if (!wordpress.multisite_enabled && !wordpress.site_id && !wordpress.site_path) {
    return "Single site";
  }

  const parts = [
    wordpress.multisite_enabled ? "Multisite enabled" : "Single site"
  ];

  if (wordpress.network_name || wordpress.network_id) {
    parts.push(`Network: ${[wordpress.network_name, wordpress.network_id].filter(Boolean).join(" / ")}`);
  }
  if (wordpress.site_id) {
    parts.push(`Site ID: ${wordpress.site_id}`);
  }
  if (wordpress.site_path) {
    parts.push(`Path: ${wordpress.site_path}`);
  }

  return escapeHtml(parts.join(" | "));
}

function renderInstallationContext(installation) {
  const parts = [
    installation.wp_multisite_enabled ? "Multisite" : "Single site"
  ];

  if (installation.wp_network_name || installation.wp_network_id) {
    parts.push(`Network: ${[installation.wp_network_name, installation.wp_network_id].filter(Boolean).join(" / ")}`);
  }
  if (installation.wp_site_id) {
    parts.push(`Site ID: ${installation.wp_site_id}`);
  }
  if (installation.wp_site_path) {
    parts.push(`Path: ${installation.wp_site_path}`);
  }
  if (installation.wp_site_url) {
    parts.push(`URL: ${installation.wp_site_url}`);
  }

  return escapeHtml(parts.join(" | "));
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  try {
    return new Date(value).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return String(value);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function healthStatusLabel(status) {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "healthy":
      return "Healthy";
    case "stale":
      return "Stale";
    case "misconfigured":
      return "Misconfigured";
    case "failing":
      return "Failing";
    case "warning":
      return "Warning";
    case "disabled":
      return "Disabled";
    default:
      return "Unknown";
  }
}

function healthChipClass(status) {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "healthy":
      return "success";
    case "stale":
    case "warning":
    case "misconfigured":
      return "warn";
    case "failing":
    case "disabled":
      return "error";
    default:
      return "";
  }
}

function mergeClientOptions({ trackedClients, catalogClients }) {
  const merged = new Map();

  trackedClients.forEach((client) => {
    const clientName = String(client?.client_name ?? "").trim();
    if (!clientName) {
      return;
    }
    merged.set(normalizeClientOption(clientName), {
      client_name: clientName
    });
  });

  catalogClients.forEach((client) => {
    const clientName = String(client?.displayName ?? client?.client_name ?? "").trim();
    if (!clientName) {
      return;
    }
    const key = normalizeClientOption(clientName);
    if (!merged.has(key)) {
      merged.set(key, {
        client_name: clientName
      });
    }
  });

  return [...merged.values()].sort((left, right) => {
    return left.client_name.localeCompare(right.client_name);
  });
}

function normalizeClientOption(value) {
  return String(value ?? "").trim().toLowerCase();
}
