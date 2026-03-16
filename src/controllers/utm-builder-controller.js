import { NodeResponse } from "../http/response.js";
import { renderAppHeader, renderAppShellStyles } from "./app-shell.js";

const COMBINATION_FIELDS = ["source", "medium", "campaign", "term", "content"];

export class UtmBuilderController {
  constructor({
    utmLibraryEditorService,
    rulesService
  }) {
    this.utmLibraryEditorService = utmLibraryEditorService;
    this.rulesService = rulesService;
  }

  async handleHtml() {
    const view = {
      clients: this.rulesService.createFormCatalog()
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
      channels: this.rulesService.createChannelCatalog()
        .sort((left, right) => left.displayName.localeCompare(right.displayName))
    };

    return NodeResponse.text(renderHtml(view), 200, {
      "Content-Type": "text/html; charset=utf-8"
    });
  }

  async handleCreate(request) {
    const parsedBody = request.parseJson();
    if (!parsedBody.ok) {
      return NodeResponse.json({
        status: "error",
        error: {
          code: parsedBody.errorCode,
          message: parsedBody.errorMessage
        }
      }, 400);
    }

    const result = await this.utmLibraryEditorService.create(parsedBody.value);
    if (!result.ok) {
      return NodeResponse.json({
        status: "error",
        error: {
          code: result.code,
          message: result.message,
          warnings: result.warnings ?? [],
          missing_fields: result.missingFields ?? []
        }
      }, result.statusCode ?? 500);
    }

    const shortLinkUnavailable = result.status === "completed_without_short_link";

    return NodeResponse.json({
      status: "ok",
      request_id: result.requestId,
      library_url: `/utms?${buildQueryString({
        highlight_request_id: result.requestId,
        toast: shortLinkUnavailable
          ? "Tracked link saved. Bitly quota blocked the short link, so the full UTM link is available."
          : result.result.reusedExisting
            ? "Tracked link saved. A matching short link already existed, so it was reused."
          : "Tracked link saved.",
        toast_level: shortLinkUnavailable ? "warning" : "success"
      })}`,
      result: serializeResult(result)
    });
  }
}

function renderHtml(view) {
  const clientOptions = view.clients
    .map((client) => `<option value="${escapeAttribute(client.key)}">${escapeHtml(client.displayName)}</option>`)
    .join("");
  const channelOptions = [
    '<option value="">Auto-detect from source or medium</option>',
    ...view.channels.map((channel) => `<option value="${escapeAttribute(channel.key)}">${escapeHtml(channel.displayName)}</option>`)
  ].join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Create Link</title>
  <style>
    :root{--bg:#f4efe5;--panel:rgba(255,250,242,.95);--ink:#17302a;--muted:#66766f;--accent:#0d6c5e;--line:rgba(23,48,42,.1);--shadow:0 24px 60px rgba(20,32,31,.09);--warning:#9a6708;--warning-bg:rgba(154,103,8,.12);--danger:#b4432b}
    *{box-sizing:border-box}body{margin:0;color:var(--ink);font-family:"Aptos","Segoe UI",sans-serif;background:radial-gradient(circle at top left,rgba(13,108,94,.18),transparent 32rem),radial-gradient(circle at top right,rgba(183,142,65,.12),transparent 26rem),linear-gradient(180deg,#faf7f1 0%,var(--bg) 100%)}
    .shell{max-width:1360px;margin:0 auto;padding:1.4rem 1rem 3rem}.hero,.panel,.result-card{background:var(--panel);border:1px solid var(--line);border-radius:1.35rem;box-shadow:var(--shadow)}.hero,.panel{padding:1rem 1.05rem;margin-bottom:1rem}
    ${renderAppShellStyles()}
    .hero-top,.panel-head,.stats,.actions,.chips,.result-copy{display:flex;gap:.85rem;flex-wrap:wrap}.hero-top,.panel-head{justify-content:space-between;align-items:flex-end}
    h1,h2,h3,h4,p{margin:0}h1,h2,h3,h4{font-family:"Aptos Display","Trebuchet MS",sans-serif}h1{font-size:clamp(2.15rem,5vw,3.2rem);line-height:.96;letter-spacing:-.05em}h2{font-size:1.22rem;letter-spacing:-.03em}
    .lede,.meta,.muted{color:var(--muted);line-height:1.55}.layout{display:grid;gap:1rem;grid-template-columns:1fr}.form-grid{display:grid;gap:.8rem;grid-template-columns:repeat(2,minmax(0,1fr));align-items:end}
    label{display:grid;gap:.35rem;font-size:.9rem;color:var(--muted)}input,select{width:100%;padding:.82rem .92rem;border:1px solid rgba(23,48,42,.14);border-radius:.95rem;background:rgba(255,255,255,.88);color:var(--ink);font:inherit}
    input:focus,select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px rgba(13,108,94,.14);background:#fff}.banner,.card{padding:.95rem 1rem;border:1px solid var(--line);border-radius:1.05rem;background:rgba(255,255,255,.76)}.banner strong,.card strong{display:block;margin-bottom:.3rem;font-size:.82rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
    .button,.link-button,.ghost-button,.mini-button{display:inline-flex;align-items:center;justify-content:center;min-height:2.75rem;padding:.76rem 1rem;border-radius:999px;border:1px solid var(--line);font:inherit;text-decoration:none;cursor:pointer;background:rgba(255,255,255,.74);color:var(--ink)}
    .button{background:var(--accent);border-color:transparent;color:#fff;box-shadow:0 12px 24px rgba(13,108,94,.18)}.ghost-button,.mini-button{min-height:2.2rem;padding:.45rem .78rem;font-size:.85rem}.badge,.chip,.pill{display:inline-flex;align-items:center;gap:.4rem;padding:.36rem .78rem;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.74);font-size:.82rem}.chip{background:rgba(13,108,94,.08);color:var(--accent)}.chip.warning{background:var(--warning-bg);color:var(--warning)}
    .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8rem}.stat{padding:.95rem 1rem;border:1px solid var(--line);border-radius:1rem;background:rgba(255,255,255,.8)}.stat strong{display:block;font-size:1.6rem;letter-spacing:-.05em}.pill-grid,.combo-preview,.list{display:flex;gap:.5rem;flex-wrap:wrap}
    .combo-row,.link-item,.utm-tile{padding:.8rem .88rem;border:1px solid var(--line);border-radius:1rem;background:rgba(255,255,255,.72)}.combo-row b,.link-label,.utm-tile strong{display:block;margin-bottom:.35rem;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.combo-row span,.link-value,.utm-value{display:block;line-height:1.45;word-break:break-word}
    .override-note{font-size:.78rem;line-height:1.45;color:var(--muted)}
    .summary-strip{display:grid;gap:.8rem;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:.8rem}.summary-card{padding:.85rem .95rem;border:1px solid var(--line);border-radius:1rem;background:rgba(255,255,255,.76)}.summary-card strong{display:block;margin-bottom:.25rem;font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
    details.flow-details{margin-top:.9rem;border:1px solid var(--line);border-radius:1.05rem;background:rgba(255,255,255,.72);padding:.2rem .95rem .95rem}details.flow-details summary{cursor:pointer;list-style:none;padding:.9rem 0;color:var(--ink);font-weight:600}details.flow-details summary::-webkit-details-marker{display:none}details.flow-details[open] summary{padding-bottom:.65rem;border-bottom:1px solid rgba(23,48,42,.08);margin-bottom:.85rem}
    .result-shell{display:none}.result-shell.visible{display:block}.result-card{padding:1rem;display:grid;gap:1rem;background:linear-gradient(180deg,rgba(255,255,255,.86),rgba(255,249,240,.92))}.result-grid{display:grid;gap:1rem;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)}.utm-grid{display:grid;gap:.65rem;grid-template-columns:repeat(2,minmax(0,1fr))}
    .status{min-height:1.2rem;font-size:.9rem;color:var(--muted)}.status.error{color:var(--danger)}.status.success{color:var(--accent)}.empty{color:var(--muted);font-size:.92rem}
    @media (max-width:1020px){.result-grid,.stats,.summary-strip{grid-template-columns:1fr}.form-grid{grid-template-columns:1fr}}@media (max-width:640px){.shell{padding-inline:.85rem}.hero,.panel,.result-card{border-radius:1rem}.utm-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="shell">
    ${renderAppHeader("builder")}
    <section class="hero">
      <div class="hero-top">
        <div>
          <h1>Create Link</h1>
          <p class="lede">Create the same tracked links the team creates in ClickUp, but with a guided form. This page uses the same rules as the bot, so the tracked link, short link, and QR code stay consistent.</p>
        </div>
      </div>
    </section>

    <section class="layout">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Create a Tracked Link</h2>
            <div class="meta">Choose a client first. The dropdowns only show approved combinations for that client so it is easier to pick the right values.</div>
          </div>
        </div>
        <form id="builder-form">
          <div class="banner">
            <strong>Simple mode</strong>
            <span>Start with the basic fields below. Open the advanced sections only if you need to choose exact UTM values or type custom ones.</span>
          </div>
          <div style="height:.8rem"></div>
          <div class="form-grid">
            <label>Client
              <select name="client" id="client" required>
                <option value="">Select a client</option>
                ${clientOptions}
              </select>
            </label>
            <label>Channel
              <select name="channel" id="channel">
                ${channelOptions}
              </select>
            </label>
            <label style="grid-column:1/-1">Destination URL
              <input type="url" name="destination_url" id="destination_url" required placeholder="https://example.com/page">
            </label>
            <label>Campaign name
              <input type="text" name="campaign_label" id="campaign_label" placeholder="spring sale or contact">
              <span class="meta">Optional plain-language name. If the advanced dropdowns stay on Auto, the app can still map this name to the right setup.</span>
            </label>
            <label class="banner" style="display:flex;gap:.65rem;align-items:flex-start">
              <input type="checkbox" name="needs_qr" id="needs_qr" style="width:auto;margin-top:.2rem;accent-color:var(--accent)">
              <span>Create a QR code for this link.</span>
            </label>
          </div>

          <div class="summary-strip">
            <div class="summary-card">
              <strong>Matching options</strong>
              <span id="matching-summary">Select a client to load the approved source, medium, campaign, term, and content combinations.</span>
            </div>
            <div class="summary-card">
              <strong>How values will be filled</strong>
              <span id="scope-summary">Source, medium, campaign, term, and content will be filled automatically unless you open the advanced options below.</span>
            </div>
          </div>

          <details class="flow-details">
            <summary>Choose approved UTM values</summary>
            <div class="meta" style="margin-bottom:.8rem">Use these dropdowns when you want to pick one of the approved client combinations from the imported spreadsheet data.</div>
            <div class="form-grid">
              <label>Source
                <select name="utm_source" id="utm_source" data-combo-field="source"></select>
              </label>
              <label>Medium
                <select name="utm_medium" id="utm_medium" data-combo-field="medium"></select>
              </label>
              <label>Campaign
                <select name="utm_campaign" id="utm_campaign" data-combo-field="campaign"></select>
              </label>
              <label>Term
                <select name="utm_term" id="utm_term" data-combo-field="term"></select>
              </label>
              <label style="grid-column:1/-1">Content
                <select name="utm_content" id="utm_content" data-combo-field="content"></select>
              </label>
            </div>
          </details>

          <details class="flow-details">
            <summary>Use custom UTM values</summary>
            <div class="meta" style="margin-bottom:.8rem">Only use these fields when you want to override the approved dropdown values. Any custom value here will be used instead.</div>
            <div class="form-grid">
              <label>Custom Source
                <input type="text" id="utm_source_custom" placeholder="Optional custom source override">
                <span class="override-note">This replaces the selected source when filled in.</span>
              </label>
              <label>Custom Medium
                <input type="text" id="utm_medium_custom" placeholder="Optional custom medium override">
                <span class="override-note">This replaces the selected medium when filled in.</span>
              </label>
              <label>Custom Campaign
                <input type="text" id="utm_campaign_custom" placeholder="Optional custom campaign override">
                <span class="override-note">This replaces the selected campaign when filled in.</span>
              </label>
              <label>Custom Term
                <input type="text" id="utm_term_custom" placeholder="Optional custom term override">
                <span class="override-note">This replaces the selected term when filled in.</span>
              </label>
              <label style="grid-column:1/-1">Custom Content
                <input type="text" id="utm_content_custom" placeholder="Optional custom content override">
                <span class="override-note">This replaces the selected content when filled in.</span>
              </label>
            </div>
          </details>

          <div class="actions" style="margin-top:1rem">
            <button class="button" type="submit" data-submit>Create Link</button>
            <button class="link-button" type="reset">Clear Form</button>
            <div class="status" id="form-status" aria-live="polite"></div>
          </div>
        </form>
      </section>

      <aside class="panel">
        <div class="panel-head">
          <div>
            <h2>Approved Values</h2>
            <div class="meta">Use this section when you want to review the approved values and matching combinations for the selected client.</div>
          </div>
        </div>
        <details class="flow-details">
          <summary>View available values and matches</summary>
          <div class="stats">
            <div class="stat"><strong id="source-count">0</strong><span>Available sources</span></div>
            <div class="stat"><strong id="combo-count">0</strong><span>Approved combinations</span></div>
            <div class="stat"><strong id="matching-count">0</strong><span>Matching combinations</span></div>
          </div>
          <div style="height:.8rem"></div>
          <div class="card">
            <strong>Available Sources</strong>
            <div class="pill-grid" id="source-pills"><span class="empty">Select a client to load sources.</span></div>
          </div>
          <div style="height:.8rem"></div>
          <div class="card">
            <strong>Available Campaigns</strong>
            <div class="pill-grid" id="campaign-pills"><span class="empty">Select a client to load campaigns.</span></div>
          </div>
          <div style="height:.8rem"></div>
          <div class="card">
            <strong>Matching Combinations</strong>
            <div class="combo-preview" id="matching-preview"><span class="empty">No client selected yet.</span></div>
          </div>
        </details>
      </aside>
    </section>

    <section class="result-shell" id="result-shell">
      <article class="result-card">
        <div class="result-meta">
          <div>
            <h2 id="result-title">New link</h2>
            <div class="meta" id="result-subtitle"></div>
          </div>
          <div class="chips" id="result-chips"></div>
        </div>
        <div class="result-grid">
          <section>
            <h3 style="margin-bottom:.75rem">UTM Values</h3>
            <div class="utm-grid" id="result-utm-grid"></div>
          </section>
          <section>
            <h3 style="margin-bottom:.75rem">Links</h3>
            <div class="list" id="result-links"></div>
          </section>
        </div>
        <div class="result-copy" id="result-copy"></div>
        <div class="chips" id="result-warnings"></div>
      </article>
    </section>
  </main>
  <script type="application/json" id="client-catalog">${serializeJson(view.clients)}</script>
  <script type="application/json" id="channel-catalog">${serializeJson(view.channels)}</script>
  <script>
    (function () {
      const EMPTY_SENTINEL = "__EMPTY__";
      const FIELD_ORDER = ${JSON.stringify(COMBINATION_FIELDS)};
      const FIELD_LABELS = {
        source: "Auto - use the selected channel or matching option",
        medium: "Auto - use the selected channel or matching option",
        campaign: "Auto - use the best matching option",
        term: "Auto - use the best matching option",
        content: "Auto - use the best matching option"
      };
      const clients = JSON.parse(document.getElementById("client-catalog").textContent);
      const channels = JSON.parse(document.getElementById("channel-catalog").textContent);
      const clientMap = Object.fromEntries(clients.map((entry) => [entry.key, entry]));
      const channelMap = Object.fromEntries(channels.map((entry) => [entry.key, entry]));
      const form = document.getElementById("builder-form");
      const status = document.getElementById("form-status");
      const clientSelect = document.getElementById("client");
      const channelSelect = document.getElementById("channel");
      const qrInput = document.getElementById("needs_qr");
      const destinationInput = document.getElementById("destination_url");
      const campaignLabelInput = document.getElementById("campaign_label");
      const fields = {
        source: document.getElementById("utm_source"),
        medium: document.getElementById("utm_medium"),
        campaign: document.getElementById("utm_campaign"),
        term: document.getElementById("utm_term"),
        content: document.getElementById("utm_content")
      };
      const customFields = {
        source: document.getElementById("utm_source_custom"),
        medium: document.getElementById("utm_medium_custom"),
        campaign: document.getElementById("utm_campaign_custom"),
        term: document.getElementById("utm_term_custom"),
        content: document.getElementById("utm_content_custom")
      };

      function normalizeValue(value) {
        return String(value ?? "").trim().toLowerCase();
      }

      function encodeValue(value) {
        return value === "" ? EMPTY_SENTINEL : String(value ?? "");
      }

      function decodeValue(value) {
        if (!value) {
          return null;
        }
        return value === EMPTY_SENTINEL ? "" : value;
      }

      function getTaxonomy() {
        return clientMap[clientSelect.value] && clientMap[clientSelect.value].taxonomy
          ? clientMap[clientSelect.value].taxonomy
          : { sources: [], campaigns: [], combinations: [] };
      }

      function currentSelections() {
        return FIELD_ORDER.reduce((accumulator, field) => {
          accumulator[field] = decodeValue(fields[field].value);
          return accumulator;
        }, {});
      }

      function filterCombinations(excludeField) {
        const selections = currentSelections();
        return (getTaxonomy().combinations || []).filter((combination) => {
          return FIELD_ORDER.every((field) => {
            if (field === excludeField) {
              return true;
            }
            if (selections[field] === null) {
              return true;
            }
            return normalizeValue(combination[field]) === normalizeValue(selections[field]);
          });
        });
      }

      function uniqueFieldValues(combinations, field) {
        const seen = new Set();
        const values = [];

        combinations.forEach((combination) => {
          const value = String(combination[field] ?? "");
          const key = normalizeValue(value);
          if (seen.has(key)) {
            return;
          }
          seen.add(key);
          values.push(value);
        });

        return values.sort((left, right) => {
          if (left === "" && right !== "") {
            return 1;
          }
          if (right === "" && left !== "") {
            return -1;
          }
          return left.localeCompare(right);
        });
      }

      function setSelectOptions(field, values) {
        const select = fields[field];
        const current = select.value;
        const options = ['<option value="">' + escapeHtml(FIELD_LABELS[field]) + '</option>'];

        values.forEach((value) => {
          options.push('<option value="' + escapeAttribute(encodeValue(value)) + '">' + escapeHtml(value === "" ? "(empty)" : value) + '</option>');
        });

        select.innerHTML = options.join("");

        if (current && values.some((value) => encodeValue(value) === current)) {
          select.value = current;
          return;
        }

        if (!current && values.length === 1 && values[0] !== "") {
          select.value = encodeValue(values[0]);
          return;
        }

        select.value = "";
      }

      function applyChannelDefaultsIfUseful() {
        const channel = channelMap[channelSelect.value];
        if (!channel) {
          return;
        }

        const defaults = channel.utmDefaults || {};
        if (!fields.source.value && defaults.source) {
          const sourceValues = uniqueFieldValues(filterCombinations("source"), "source");
          const match = sourceValues.find((value) => normalizeValue(value) === normalizeValue(defaults.source));
          if (match !== undefined) {
            fields.source.value = encodeValue(match);
          }
        }
        if (!fields.medium.value && defaults.medium) {
          const mediumValues = uniqueFieldValues(filterCombinations("medium"), "medium");
          const match = mediumValues.find((value) => normalizeValue(value) === normalizeValue(defaults.medium));
          if (match !== undefined) {
            fields.medium.value = encodeValue(match);
          }
        }
        if (channel.requiresQr) {
          qrInput.checked = true;
        }
      }

      function syncCombinationFields() {
        for (let iteration = 0; iteration < 4; iteration += 1) {
          const before = FIELD_ORDER.map((field) => fields[field].value).join("|");
          FIELD_ORDER.forEach((field) => {
            setSelectOptions(field, uniqueFieldValues(filterCombinations(field), field));
          });
          applyChannelDefaultsIfUseful();
          const after = FIELD_ORDER.map((field) => fields[field].value).join("|");
          if (before === after) {
            break;
          }
        }
      }

      function renderPills(targetId, values, emptyMessage) {
        const target = document.getElementById(targetId);
        if (!target) {
          return;
        }
        if (!values || values.length === 0) {
          target.innerHTML = '<span class="empty">' + escapeHtml(emptyMessage) + '</span>';
          return;
        }
        target.innerHTML = values.slice(0, 10).map((value) => '<span class="pill">' + escapeHtml(value || "(empty)") + '</span>').join("");
      }

      function formatCombination(combination) {
        return [
          combination.source || "(empty source)",
          combination.medium || "(empty medium)",
          combination.campaign || "(empty campaign)",
          combination.term === "" ? "(empty term)" : combination.term || "(empty term)",
          combination.content === "" ? "(empty content)" : combination.content || "(empty content)"
        ].join(" - ");
      }

      function updateSidebar() {
        const taxonomy = getTaxonomy();
        const matching = filterCombinations(null);
        const exactSelections = FIELD_ORDER
          .map((field) => decodeValue(fields[field].value))
          .filter((value) => value !== null && value !== "")
          .length;
        const customSelections = FIELD_ORDER
          .filter((field) => String(customFields[field].value ?? "").trim());
        document.getElementById("source-count").textContent = String((taxonomy.sources || []).length);
        document.getElementById("combo-count").textContent = String((taxonomy.combinations || []).length);
        document.getElementById("matching-count").textContent = String(matching.length);
        document.getElementById("matching-summary").textContent = matching.length > 0
          ? matching.length === 1
            ? "One approved combination matches the current selections."
            : String(matching.length) + " approved combinations still match the current selections."
          : "No approved combinations match the current selections right now.";
        document.getElementById("scope-summary").textContent = customSelections.length > 0
          ? "Custom values are active for " + customSelections.join(", ") + ". Those values will be used when you create the link."
          : exactSelections > 0
            ? "An approved combination is partially selected. The remaining fields are still limited to valid client options."
            : "Source, medium, campaign, term, and content will be filled automatically unless you open the advanced options below.";
        renderPills("source-pills", taxonomy.sources || [], "Select a client to load sources.");
        renderPills("campaign-pills", taxonomy.campaigns || [], "Select a client to load campaigns.");
        const preview = document.getElementById("matching-preview");
        preview.innerHTML = matching.length > 0
          ? matching.slice(0, 4).map((combination, index) => '<div class="combo-row"><b>Match ' + (index + 1) + '</b><span>' + escapeHtml(formatCombination(combination)) + '</span></div>').join("")
          : '<span class="empty">No approved combinations match the current selection. Clear one of the dropdowns or change the channel.</span>';
      }

      function refreshBuilder() {
        syncCombinationFields();
        updateSidebar();
      }

      async function copyText(value) {
        if (!value) {
          return false;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(value);
          return true;
        }
        const input = document.createElement("textarea");
        input.value = value;
        input.setAttribute("readonly", "readonly");
        input.style.position = "absolute";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(input);
        return copied;
      }

      function showStatus(message, level) {
        status.textContent = message || "";
        status.className = "status" + (level ? " " + level : "");
      }

      function effectiveFieldValue(field) {
        const customValue = String(customFields[field].value ?? "").trim();
        if (customValue) {
          return customValue;
        }

        return decodeValue(fields[field].value);
      }

      function renderLinkItem(label, value) {
        if (!value) {
          return '<div class="link-item"><div class="link-label">' + escapeHtml(label) + '</div><div class="empty">Not available for this link.</div></div>';
        }
        return '<div class="link-item"><div class="link-label">' + escapeHtml(label) + '</div><a class="link-value" href="' + escapeAttribute(value) + '" target="_blank" rel="noreferrer">' + escapeHtml(value) + '</a></div>';
      }

      function renderResult(payload) {
        const shell = document.getElementById("result-shell");
        document.getElementById("result-title").textContent = payload.message;
        document.getElementById("result-subtitle").textContent = payload.client_display_name + " - " + payload.channel_display_name;
        document.getElementById("result-chips").innerHTML = [
          '<span class="chip">' + escapeHtml(payload.status_label) + '</span>',
          payload.reused_existing ? '<span class="chip">Existing short link reused</span>' : '<span class="chip">New saved link</span>',
          payload.qr_url ? '<span class="chip">QR code ready</span>' : '<span class="chip">No QR code</span>'
        ].join("");
        document.getElementById("result-utm-grid").innerHTML = [
          ["Source", payload.utm_source],
          ["Medium", payload.utm_medium],
          ["Campaign", payload.utm_campaign],
          ["Term", payload.utm_term === "" ? "(empty)" : payload.utm_term],
          ["Content", payload.utm_content === "" ? "(empty)" : payload.utm_content]
        ].map((entry) => '<div class="utm-tile"><strong>' + escapeHtml(entry[0]) + '</strong><div class="utm-value">' + escapeHtml(entry[1] || "--") + '</div></div>').join("");
        document.getElementById("result-links").innerHTML = [
          renderLinkItem("Tracked link", payload.tracked_url),
          renderLinkItem("Short link", payload.short_url),
          renderLinkItem("QR code", payload.qr_url),
          renderLinkItem("Open saved link", payload.library_url)
        ].join("");
        document.getElementById("result-copy").innerHTML = [
          payload.tracked_url ? '<button type="button" class="mini-button" data-copy="' + escapeAttribute(payload.tracked_url) + '">Copy tracked link</button>' : "",
          payload.short_url ? '<button type="button" class="mini-button" data-copy="' + escapeAttribute(payload.short_url) + '">Copy short link</button>' : "",
          payload.qr_url ? '<button type="button" class="mini-button" data-copy="' + escapeAttribute(payload.qr_url) + '">Copy QR code link</button>' : "",
          payload.library_url ? '<a class="ghost-button" href="' + escapeAttribute(payload.library_url) + '">Open saved link</a>' : ""
        ].join("");
        document.getElementById("result-warnings").innerHTML = (payload.warnings || []).map((warning) => '<span class="chip warning">' + escapeHtml(warning) + '</span>').join("");
        shell.classList.add("visible");
        shell.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      document.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-copy]");
        if (!button) {
          return;
        }
        event.preventDefault();
        try {
          const copied = await copyText(button.getAttribute("data-copy") || "");
          showStatus(copied ? "Copied to clipboard." : "Copy failed.", copied ? "success" : "error");
        } catch {
          showStatus("Copy failed.", "error");
        }
      });

      clientSelect.addEventListener("change", () => {
        FIELD_ORDER.forEach((field) => {
          fields[field].value = "";
        });
        refreshBuilder();
      });

      channelSelect.addEventListener("change", refreshBuilder);

      FIELD_ORDER.forEach((field) => {
        fields[field].addEventListener("change", refreshBuilder);
      });

      form.addEventListener("reset", () => {
        window.setTimeout(() => {
          channelSelect.value = "";
          destinationInput.value = "";
          campaignLabelInput.value = "";
          refreshBuilder();
          showStatus("", "");
          document.getElementById("result-shell").classList.remove("visible");
        }, 0);
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector("[data-submit]");
        const payload = {
          client: clientSelect.value,
          destination_url: destinationInput.value,
          needs_qr: qrInput.checked
        };

        if (channelSelect.value) {
          payload.channel = channelSelect.value;
        }

        if (campaignLabelInput.value.trim()) {
          payload.campaign_label = campaignLabelInput.value.trim();
        }

        FIELD_ORDER.forEach((field) => {
          const value = effectiveFieldValue(field);
          if (value !== null) {
            payload["utm_" + field] = value;
          }
        });

        showStatus("Creating link...", "");
        submitButton.disabled = true;

        try {
          const response = await fetch("/new", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const body = await response.json();
          if (!response.ok || body.status !== "ok") {
            const message = body && body.error && body.error.message ? body.error.message : "Unable to create the link right now.";
            showStatus(message, "error");
            return;
          }

          renderResult(body.result);
          showStatus(body.result.status === "completed_without_short_link"
            ? "Tracked link saved. Bitly quota blocked the short link."
            : "Link created.", "success");
        } catch (error) {
          showStatus(error && error.message ? error.message : "Unable to create the link right now.", "error");
        } finally {
          submitButton.disabled = false;
        }
      });

      refreshBuilder();
    })();

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function escapeAttribute(value) {
      return escapeHtml(value);
    }
  </script>
</body>
</html>`;
}

function serializeResult(result) {
  const normalized = result.normalized;
  return {
    request_id: result.requestId,
    status: result.status,
    status_label: result.status === "completed_without_short_link"
      ? "Saved without short link"
      : "Saved",
    message: result.status === "completed_without_short_link"
      ? "Tracked link created"
      : result.result.reusedExisting
        ? "Tracked link created"
        : "Tracked link created",
    client: normalized.client,
    client_display_name: normalized.clientDisplayName,
    channel: normalized.channel,
    channel_display_name: normalized.channelDisplayName,
    tracked_url: normalized.finalLongUrl,
    short_url: result.result.shortUrl,
    qr_url: result.result.qrUrl,
    destination_url: normalized.destinationUrl,
    utm_source: normalized.utmSource,
    utm_medium: normalized.utmMedium,
    utm_campaign: normalized.utmCampaign,
    utm_term: normalized.utmTerm,
    utm_content: normalized.utmContent,
    warnings: normalized.warnings,
    reused_existing: result.result.reusedExisting,
    library_url: `/utms?${buildQueryString({
      highlight_request_id: result.requestId
    })}`
  };
}

function buildQueryString(query) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return;
    }
    params.set(key, String(value));
  });
  return params.toString();
}

function serializeJson(value) {
  return JSON.stringify(value)
    .replace(/</gu, "\\u003c")
    .replace(/>/gu, "\\u003e")
    .replace(/&/gu, "\\u0026");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
