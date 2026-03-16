import { NodeResponse } from "../http/response.js";
import { renderAppHeader, renderAppShellStyles } from "./app-shell.js";

const SORT_LABELS = {
  recent: "Newest first",
  oldest: "Oldest first",
  client: "Client A-Z",
  campaign: "Campaign name A-Z",
  requests: "Most requests first"
};

const TOGGLE_LABELS = {
  all: "All",
  with_qr: "With QR",
  without_qr: "Without QR",
  with_short_link: "With short link",
  without_short_link: "No short link"
};

export class UtmLibraryController {
  constructor({
    utmLibraryService,
    utmLibraryEditorService,
    rulesService
  }) {
    this.utmLibraryService = utmLibraryService;
    this.utmLibraryEditorService = utmLibraryEditorService;
    this.rulesService = rulesService;
  }

  async handleHtml(request) {
    const library = this.utmLibraryService.list(request.query);
    const view = {
      library,
      toast: normalizeTextValue(request.query.toast),
      toastLevel: normalizeToastLevel(request.query.toast_level),
      highlightRequestId: positiveInteger(request.query.highlight_request_id, null),
      editorOptions: {
        clients: this.rulesService.clients(),
        channels: this.rulesService.createChannelCatalog().map((channel) => channel.key)
      }
    };

    return NodeResponse.text(renderHtml(view), 200, {
      "Content-Type": "text/html; charset=utf-8"
    });
  }

  async handleJson(request) {
    return NodeResponse.json(this.utmLibraryService.list(request.query));
  }

  async handleCsv(request) {
    const library = this.utmLibraryService.list({
      ...request.query,
      page: 1,
      per_page: 10000
    });

    return NodeResponse.text(renderCsv(library.items), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"utm-library.csv\""
    });
  }

  async handleRegenerate(request) {
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

    const result = await this.utmLibraryEditorService.regenerate(parsedBody.value);
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

    const toast = result.status === "completed_without_short_link"
      ? "Updated link saved. Bitly quota blocked the short link, so the full UTM link is stored instead."
      : result.result.reusedExisting
        ? "Updated link saved. A matching short link already existed, so it was reused."
        : "Updated link saved with a fresh tracked URL.";

    return NodeResponse.json({
      status: "ok",
      request_id: result.requestId,
      redirect_url: `/utms?${buildQueryString({
        highlight_request_id: result.requestId,
        toast,
        toast_level: result.status === "completed_without_short_link" ? "warning" : "success"
      })}`
    });
  }

  async handleDelete(request) {
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

    const result = await this.utmLibraryEditorService.deleteEntry(parsedBody.value);
    if (!result.ok) {
      return NodeResponse.json({
        status: "error",
        error: {
          code: result.code,
          message: result.message
        }
      }, result.statusCode ?? 500);
    }

    return NodeResponse.json({
      status: "ok",
      deleted_requests: result.deletedRequests,
      redirect_url: `/utms?${buildQueryString({
        toast: result.deletedRequests > 1
          ? "Saved link deleted. Matching history rows were deleted too."
          : "Saved link deleted.",
        toast_level: "success"
      })}`
    });
  }
}

function renderHtml(view) {
  const { library, toast, toastLevel, highlightRequestId, editorOptions } = view;
  const queryBase = {
    client: library.filters.client,
    channel: library.filters.channel,
    source: library.filters.source,
    medium: library.filters.medium,
    campaign: library.filters.campaign,
    status: library.filters.status,
    search: library.filters.search,
    qr: library.filters.qr,
    short_link: library.filters.shortLink,
    sort: library.filters.sort,
    per_page: library.filters.perPage
  };
  const csvHref = `/utms.csv?${buildQueryString({ ...queryBase, page: 1 })}`;
  const jsonHref = `/utms.json?${buildQueryString({ ...queryBase, page: library.pagination.page })}`;
  const activeFilterCount = [
    library.filters.search,
    library.filters.client,
    library.filters.channel,
    library.filters.source,
    library.filters.medium,
    library.filters.campaign,
    library.filters.status !== "all" ? library.filters.status : "",
    library.filters.qr !== "all" ? library.filters.qr : "",
    library.filters.shortLink !== "all" ? library.filters.shortLink : "",
    library.filters.sort !== "recent" ? library.filters.sort : ""
  ].filter(Boolean).length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Saved Links</title>
  <style>
    :root{--bg:#f4efe5;--panel:rgba(255,250,242,.94);--panel-strong:rgba(255,255,255,.86);--ink:#17302a;--muted:#66766f;--accent:#0d6c5e;--accent-dark:#0a5045;--line:rgba(23,48,42,.1);--shadow:0 24px 60px rgba(20,32,31,.09);--warning:#9a6708;--warning-bg:rgba(154,103,8,.12);--danger:#b4432b;--danger-bg:rgba(180,67,43,.12);}
    *{box-sizing:border-box} html{scroll-behavior:smooth} body{margin:0;color:var(--ink);font-family:"Aptos","Segoe UI",sans-serif;background:radial-gradient(circle at top left,rgba(13,108,94,.18),transparent 32rem),radial-gradient(circle at top right,rgba(183,142,65,.12),transparent 26rem),linear-gradient(180deg,#faf7f1 0%,var(--bg) 100%)}
    .shell{max-width:1440px;margin:0 auto;padding:1.4rem 1rem 3rem}
    ${renderAppShellStyles()}
    .hero,.panel,.card{background:var(--panel);border:1px solid var(--line);border-radius:1.35rem;box-shadow:var(--shadow)}
    .hero,.panel{padding:1rem 1.05rem;margin-bottom:1rem}
    .hero-top,.panel-head,.results-head,.card-head,.pagination{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:flex-end}
    .hero-top h1,.panel-head h2,.results-head h2,.card-title h3,.section h4{margin:0;font-family:"Aptos Display","Trebuchet MS",sans-serif}
    .hero-top h1{font-size:clamp(2.2rem,5vw,3.3rem);line-height:.96;letter-spacing:-.05em}
    .panel-head h2,.results-head h2{font-size:1.28rem;letter-spacing:-.03em}
    .card-title h3{font-size:1.36rem;letter-spacing:-.04em;line-height:1}
    .lede,.meta,.muted,.empty{color:var(--muted);line-height:1.5} .lede{max-width:58rem;margin:.45rem 0 0}
    .actions,.hero-actions,.chips,.mini-actions,.page-links{display:flex;gap:.7rem;flex-wrap:wrap;align-items:center}
    .badge,.chip{display:inline-flex;align-items:center;gap:.45rem;padding:.36rem .78rem;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.72);font-size:.82rem}
    .chip{background:rgba(13,108,94,.1);color:var(--accent)} .chip.neutral{background:rgba(23,48,42,.07);color:var(--ink)} .chip.warning{background:var(--warning-bg);color:var(--warning)} .chip.error{background:var(--danger-bg);color:var(--danger)}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:.85rem;margin-top:.2rem}
    .stat{padding:.95rem 1rem;border:1px solid var(--line);border-radius:1.1rem;background:var(--panel-strong)} .stat strong{display:block;font-size:1.72rem;letter-spacing:-.05em}
    .filters{display:grid;gap:.8rem;grid-template-columns:minmax(14rem,1.25fr) repeat(4,minmax(9rem,1fr));align-items:end}
    label{display:grid;gap:.35rem;font-size:.9rem;color:var(--muted)}
    input,select{width:100%;padding:.78rem .9rem;border:1px solid rgba(23,48,42,.14);border-radius:.95rem;background:rgba(255,255,255,.86);color:var(--ink);font:inherit}
    input:focus,select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px rgba(13,108,94,.14);background:#fff}
    .button,.link-button,.mini-button,.subtle-link,.page-link,.danger-button{display:inline-flex;align-items:center;justify-content:center;min-height:2.8rem;padding:.78rem 1rem;border-radius:999px;border:1px solid var(--line);font:inherit;text-decoration:none;cursor:pointer;background:rgba(255,255,255,.72);color:var(--ink)}
    .button{background:var(--accent);border-color:transparent;color:#fff;box-shadow:0 12px 24px rgba(13,108,94,.18)} .mini-button,.subtle-link,.page-link,.danger-button.mini{min-height:2.1rem;padding:.42rem .75rem;font-size:.82rem}
    .danger-button{background:#fff3f0;border-color:rgba(180,67,43,.22);color:var(--danger)}
    .page-link.current{background:var(--accent);border-color:transparent;color:#fff}
    .grid{display:grid;gap:1rem}
    .card{padding:1rem;display:grid;gap:1rem;scroll-margin-top:1rem;background:linear-gradient(180deg,rgba(255,255,255,.82),rgba(255,249,240,.92))}
    .card.highlight{border-color:rgba(13,108,94,.34);box-shadow:0 0 0 3px rgba(13,108,94,.11),var(--shadow)}
    .eyebrow{color:var(--muted);font-size:.8rem;letter-spacing:.08em;text-transform:uppercase}
    .card-title{display:grid;gap:.35rem} .card-sub{color:var(--muted);font-size:.96rem}
    .banner{display:grid;gap:.75rem;padding:.8rem .95rem;border:1px solid rgba(13,108,94,.12);border-radius:1.05rem;background:linear-gradient(135deg,rgba(13,108,94,.08),rgba(255,255,255,.7));grid-template-columns:auto minmax(0,1fr) auto;align-items:center}
    .banner-label{font-size:.78rem;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}
    .banner-main{display:grid;gap:.18rem;min-width:0}
    .banner-value{font-size:clamp(1rem,1.5vw,1.22rem);font-weight:700;line-height:1.06;letter-spacing:-.04em;word-break:break-word}
    .banner-meta{color:var(--muted);font-size:.88rem;line-height:1.35;word-break:break-word}
    .card-grid{display:grid;gap:1rem;grid-template-columns:minmax(16rem,1.05fr) minmax(20rem,1.35fr) minmax(13rem,.9fr)}
    .section{display:grid;gap:.75rem;align-content:start;min-width:0} .section h4{font-size:.88rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
    .utm-grid{display:grid;gap:.65rem;grid-template-columns:repeat(2,minmax(0,1fr))}
    .utm-tile{min-height:4.5rem;padding:.76rem .82rem;border:1px solid var(--line);border-radius:1rem;background:rgba(255,255,255,.72)} .utm-tile strong{display:block;margin-bottom:.4rem;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)} .utm-value{word-break:break-word;line-height:1.4}
    .list{display:flex;flex-direction:column;gap:.75rem}
    .link-item,.usage-item{padding-bottom:.72rem;border-bottom:1px dashed rgba(23,48,42,.11)} .link-item:last-child,.usage-item:last-child{padding-bottom:0;border-bottom:0}
    .link-label{margin-bottom:.35rem;color:var(--muted);font-size:.8rem;letter-spacing:.06em;text-transform:uppercase}
    .link-target{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.75rem;align-items:flex-start}
    .link-value{min-width:0;display:block;padding:.68rem .76rem;border:1px solid var(--line);border-radius:.95rem;background:rgba(255,255,255,.76);color:var(--accent-dark);text-decoration:none;word-break:break-word;line-height:1.5;font-family:"Aptos Mono","Cascadia Code","Consolas",monospace;font-size:.9rem}
    .qr-frame{width:min(100%,11rem);aspect-ratio:1;border:1px solid var(--line);border-radius:1.1rem;background:linear-gradient(135deg,rgba(255,255,255,.92),rgba(242,236,224,.9));overflow:hidden;display:grid;place-items:center}
    .qr-frame img{width:100%;height:100%;display:block;object-fit:cover;background:#fff} .qr-placeholder{padding:1rem;text-align:center;color:var(--muted);line-height:1.5;font-size:.92rem}
    .usage-item{display:flex;justify-content:space-between;gap:.75rem;align-items:baseline} .usage-item strong{color:var(--muted);font-size:.82rem;letter-spacing:.06em;text-transform:uppercase} .usage-item span{text-align:right;line-height:1.4}
    .warnings{display:flex;gap:.45rem;flex-wrap:wrap}
    details{border-top:1px dashed rgba(23,48,42,.12);padding-top:.9rem} details summary{cursor:pointer;color:var(--muted);list-style:none;font-size:.92rem} details summary::-webkit-details-marker{display:none} details[open] summary{margin-bottom:.75rem}
    .request{margin:0;padding:.85rem .92rem;border:1px solid var(--line);border-radius:.95rem;background:rgba(255,255,255,.72);line-height:1.55;word-break:break-word}
    .editor{display:grid;gap:.85rem} .editor-note{padding:.8rem .9rem;border:1px solid rgba(13,108,94,.12);border-radius:.95rem;background:rgba(13,108,94,.06);color:var(--muted);line-height:1.5}
    .editor-grid{display:grid;gap:.75rem;grid-template-columns:repeat(2,minmax(0,1fr))} .editor-grid.wide{grid-template-columns:repeat(3,minmax(0,1fr))}
    .checkbox{display:flex;gap:.65rem;align-items:center;padding:.7rem .85rem;border:1px solid var(--line);border-radius:.95rem;background:rgba(255,255,255,.72);color:var(--ink)} .checkbox input{width:auto;margin:0;accent-color:var(--accent)}
    .form-status{min-height:1.2rem;font-size:.88rem;color:var(--muted)} .form-status.error{color:var(--danger)} .form-status.success{color:var(--accent)}
    .empty{padding:3.25rem 1rem;text-align:center;border:1px dashed rgba(23,48,42,.16);border-radius:1.2rem;background:rgba(255,255,255,.55)}
    .toast{position:fixed;right:1rem;bottom:1rem;max-width:22rem;padding:.85rem 1rem;border-radius:1rem;background:rgba(23,48,42,.94);color:#fff;box-shadow:0 18px 36px rgba(23,48,42,.28);opacity:0;pointer-events:none;transform:translateY(12px);transition:opacity 140ms ease,transform 140ms ease} .toast.warning{background:rgba(154,103,8,.96)} .toast.error{background:rgba(180,67,43,.96)} .toast.visible{opacity:1;transform:translateY(0)}
    @media (max-width:1220px){.filters{grid-template-columns:repeat(3,minmax(0,1fr))}.card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sidebar{grid-column:span 2}.banner{grid-template-columns:auto minmax(0,1fr)}}
    @media (max-width:860px){.filters,.editor-grid,.editor-grid.wide,.card-grid,.utm-grid{grid-template-columns:1fr}.sidebar{grid-column:auto}.banner{grid-template-columns:1fr}}
    @media (max-width:640px){.shell{padding-inline:.85rem}.hero,.panel,.card{border-radius:1rem}.hero-top,.panel-head,.results-head,.card-head,.pagination,.usage-item,.link-target{display:grid}.usage-item span{text-align:left}}
  </style>
</head>
<body>
  <main class="shell">
    ${renderAppHeader("library")}
    <section class="hero">
      <div class="hero-top">
        <div>
          <h1>Saved Links</h1>
          <p class="lede">Browse, filter, edit, and remove tracked links in one place. Updating a card creates a new saved version so the team can keep the latest tracked link, short link, and QR code.</p>
        </div>
        <div class="hero-actions">
          <span class="badge"><strong>${activeFilterCount}</strong> active filter${activeFilterCount === 1 ? "" : "s"}</span>
          <a class="link-button" href="${csvHref}">Download CSV</a>
          <a class="link-button" href="${jsonHref}">Download JSON</a>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><strong>${library.summary.totalUniqueLinks}</strong><span>Saved links</span></div>
        <div class="stat"><strong>${library.summary.filteredLinks}</strong><span>Links shown</span></div>
        <div class="stat"><strong>${library.summary.requestsRepresented}</strong><span>Total requests</span></div>
        <div class="stat"><strong>${library.summary.withQr}</strong><span>Links with QR codes</span></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Find Links</h2>
          <div class="meta">Search by client, campaign, URL, or original request message. Use the source and medium filters when you need a very specific link.</div>
        </div>
        <div class="chips">
          <span class="badge"><strong>${library.summary.withoutShortLink}</strong> shown without short link</span>
        </div>
      </div>
      <form method="get" action="/utms" class="filters">
        <label>Search<input type="search" name="search" value="${escapeHtml(library.filters.search)}" placeholder="Client, campaign, URL, or message"></label>
        <label>Client<select name="client">${renderOptions("All clients", "", library.available.clients, library.filters.client)}</select></label>
        <label>Channel<select name="channel">${renderOptions("All channels", "", library.available.channels, library.filters.channel)}</select></label>
        <label>Source<select name="source">${renderTextOptions("All sources", "", library.available.sources, library.filters.source)}</select></label>
        <label>Medium<select name="medium">${renderTextOptions("All mediums", "", library.available.mediums, library.filters.medium)}</select></label>
        <label>Campaign name<input type="text" name="campaign" value="${escapeHtml(library.filters.campaign)}" placeholder="spring_sale"></label>
        <label>Status<select name="status">${renderOptions("All statuses", "all", library.available.statuses.filter((value) => value !== "all"), library.filters.status)}</select></label>
        <label>Short link<select name="short_link">${renderToggleOptions(library.available.shortLinkStates, library.filters.shortLink)}</select></label>
        <label>QR code<select name="qr">${renderToggleOptions(library.available.qrStates, library.filters.qr)}</select></label>
        <label>Sort<select name="sort">${renderSortOptions(library.available.sorts, library.filters.sort)}</select></label>
        <label>Links per page<select name="per_page">${renderPerPageOptions(library.filters.perPage)}</select></label>
        <input type="hidden" name="page" value="1">
        <div class="actions">
          <button class="button" type="submit">Show Results</button>
          <a class="link-button" href="/utms">Clear Filters</a>
        </div>
      </form>
    </section>

    <section class="panel">
      <div class="results-head">
        <div>
          <h2>Matching Links</h2>
          <div class="meta">Page ${library.pagination.page} of ${library.pagination.pageCount} - ${library.pagination.total} link(s)</div>
        </div>
        <div class="chips">
          <span class="chip neutral">${escapeHtml(SORT_LABELS[library.filters.sort] ?? "Newest first")}</span>
          <span class="chip neutral">${library.summary.requestsRepresented} request${library.summary.requestsRepresented === 1 ? "" : "s"} included</span>
        </div>
      </div>
      <div class="grid">
        ${library.items.length > 0
          ? library.items.map((item) => renderResultCard(item, { highlightRequestId, editorOptions })).join("")
          : '<div class="empty">No saved links matched your filters.</div>'}
      </div>
      <div class="pagination">
        <div class="meta">Open any card to update a link, add a QR code, or remove it from the saved history.</div>
        <div class="page-links">${renderPaginationLinks(library.pagination, queryBase)}</div>
      </div>
    </section>
  </main>
  <div class="toast ${escapeAttribute(toastLevel)}" id="toast" aria-live="polite">${escapeHtml(toast)}</div>
  <script>
    (function () {
      const toast = document.getElementById("toast");
      let toastTimer = null;
      function showToast(message, level) {
        if (!toast || !message) return;
        toast.textContent = message;
        toast.className = "toast visible" + (level ? " " + level : "");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
      }
      async function copyText(value) {
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
      document.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-copy]");
        if (!button) return;
        event.preventDefault();
        try {
          const ok = await copyText(button.getAttribute("data-copy") || "");
          showToast(ok ? "Copied to clipboard" : "Copy failed", ok ? "success" : "error");
        } catch {
          showToast("Copy failed", "error");
        }
      });
      document.addEventListener("submit", async (event) => {
        const form = event.target.closest("[data-regenerate-form]");
        if (!form) return;
        event.preventDefault();
        const status = form.querySelector("[data-form-status]");
        const submitButton = form.querySelector("[data-submit]");
        const payload = Object.fromEntries(new FormData(form).entries());
        payload.needs_qr = form.querySelector("[name='needs_qr']").checked;
        if (status) {
          status.textContent = "Saving changes...";
          status.className = "form-status";
        }
        if (submitButton) {
          submitButton.disabled = true;
        }
        try {
          const response = await fetch("/utms/regenerate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const body = await response.json();
          if (!response.ok || body.status !== "ok") {
            const message = body && body.error && body.error.message ? body.error.message : "Unable to regenerate this link right now.";
            if (status) {
              status.textContent = message;
              status.className = "form-status error";
            }
            showToast(message, "error");
            return;
          }
          if (status) {
            status.textContent = "Saved. Reloading this link...";
            status.className = "form-status success";
          }
          window.location.assign(body.redirect_url || "/utms");
        } catch (error) {
          const message = error && error.message ? error.message : "Unable to regenerate this link right now.";
          if (status) {
            status.textContent = message;
            status.className = "form-status error";
          }
          showToast(message, "error");
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
          }
        }
      });
      document.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-delete-request-id]");
        if (!button) return;
        event.preventDefault();
        const requestId = button.getAttribute("data-delete-request-id");
        if (!requestId) return;
        if (!window.confirm("Delete this saved link? This removes the saved history for this tracked link.")) {
          return;
        }
        button.disabled = true;
        try {
          const response = await fetch("/utms/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ request_id: requestId })
          });
          const body = await response.json();
          if (!response.ok || body.status !== "ok") {
            const message = body && body.error && body.error.message ? body.error.message : "Unable to delete this saved link right now.";
            showToast(message, "error");
            return;
          }
          window.location.assign(body.redirect_url || "/utms");
        } catch (error) {
          const message = error && error.message ? error.message : "Unable to delete this saved link right now.";
          showToast(message, "error");
        } finally {
          button.disabled = false;
        }
      });
      const highlighted = document.querySelector("[data-highlight='true']");
      if (highlighted) {
        highlighted.scrollIntoView({ block: "start" });
      }
      if (toast && toast.textContent.trim()) {
        showToast(toast.textContent.trim(), toast.classList.contains("warning") ? "warning" : toast.classList.contains("error") ? "error" : "success");
      }
    })();
  </script>
</body>
</html>`;
}

function renderCsv(items) {
  const header = [
    "request_id",
    "status",
    "client",
    "channel",
    "asset_type",
    "campaign_label",
    "canonical_campaign",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "destination_url",
    "final_long_url",
    "short_url",
    "qr_url",
    "request_count",
    "first_seen_at",
    "last_seen_at",
    "original_message"
  ];
  const lines = [
    header.join(","),
    ...items.map((item) => [
      item.requestId,
      item.status,
      item.clientDisplayName,
      item.channelDisplayName,
      item.assetType,
      item.campaignLabel,
      item.canonicalCampaign,
      item.utmSource,
      item.utmMedium,
      item.utmCampaign,
      item.utmTerm,
      item.utmContent,
      item.destinationUrl,
      item.finalLongUrl,
      item.shortUrl,
      item.qrUrl,
      item.requestCount,
      item.firstCreatedAt,
      item.lastCreatedAt,
      item.originalMessage
    ].map(escapeCsv).join(","))
  ];

  return `${lines.join("\n")}\n`;
}

function renderResultCard(item, { highlightRequestId, editorOptions }) {
  const campaignValue = item.utmCampaign || item.canonicalCampaign || "(none)";
  const campaignMeta = buildCampaignMeta(item, campaignValue);
  const subtitleParts = [item.channelDisplayName, item.assetType ? humanize(item.assetType) : ""].filter(Boolean);
  const isHighlighted = highlightRequestId === item.requestId;

  return `<article class="card${isHighlighted ? " highlight" : ""}" id="request-${item.requestId}" data-highlight="${isHighlighted ? "true" : "false"}">
    <div class="card-head">
      <div class="card-title">
        <div class="eyebrow">Most recent request ${escapeHtml(formatDate(item.lastCreatedAt))}</div>
        <h3>${escapeHtml(item.clientDisplayName)}</h3>
        <div class="card-sub">${escapeHtml(subtitleParts.join(" - "))}</div>
      </div>
      <div class="chips">
        <button type="button" class="danger-button mini" data-delete-request-id="${escapeAttribute(item.requestId)}">Delete Link</button>
        ${renderChip(item.assetType)}
        ${renderStatusChip(item.status)}
        ${renderChip(item.hasShortUrl ? "Short link ready" : "Short link unavailable", item.hasShortUrl ? "default" : "warning")}
        ${renderChip(item.hasQr ? "QR code ready" : "No QR code", item.hasQr ? "default" : "neutral")}
        <span class="chip neutral">${item.requestCount} request${item.requestCount === 1 ? "" : "s"}</span>
      </div>
    </div>
    <div class="banner">
      <div class="banner-label">Campaign</div>
      <div class="banner-main">
        <div class="banner-value">${escapeHtml(campaignValue)}</div>
        ${campaignMeta ? `<div class="banner-meta">${escapeHtml(campaignMeta)}</div>` : ""}
      </div>
      <span class="chip neutral">${item.hasShortUrl ? "Short link ready" : item.hasQr ? "QR code ready" : "Saved link"}</span>
    </div>
    <div class="card-grid">
      <section class="section">
        <h4>UTM Values</h4>
        <div class="utm-grid">
          ${renderUtmTile("Source", item.utmSource)}
          ${renderUtmTile("Medium", item.utmMedium)}
          ${renderUtmTile("Campaign", item.utmCampaign)}
          ${renderUtmTile("Term", item.utmTerm)}
          ${renderUtmTile("Content", item.utmContent)}
        </div>
      </section>
      <section class="section">
        <h4>Links</h4>
        <div class="list">
          ${renderLinkItem("Destination page", item.destinationUrl)}
          ${renderLinkItem("Tracked link", item.finalLongUrl)}
          ${renderLinkItem("Short link", item.shortUrl)}
        </div>
      </section>
      <section class="section sidebar">
        <h4>QR Code And Details</h4>
        ${renderQrPanel(item)}
        <div class="list">
          ${renderUsageItem("Record ID", `#${item.requestId}`)}
          ${renderUsageItem("First request", formatDate(item.firstCreatedAt))}
          ${renderUsageItem("Most recent result", item.reusedExisting ? "Reused an existing short link" : "Created or refreshed this link")}
        </div>
        ${renderWarnings(item.warnings)}
      </section>
    </div>
    <details${isHighlighted ? " open" : ""}>
      <summary>Edit this link</summary>
      ${renderEditor(item, editorOptions)}
    </details>
    <details>
      <summary>Original message</summary>
      <p class="request">${escapeHtml(item.originalMessage || "No original message was saved.")}</p>
    </details>
  </article>`;
}

function renderEditor(item, editorOptions) {
  return `<div class="editor">
    <div class="editor-note">Saving changes creates a new saved version of this link. If the same tracked link already exists, the app reuses the matching short link. If not, it creates a new one and can also add a QR code.</div>
    <form data-regenerate-form>
      <input type="hidden" name="original_request_id" value="${escapeAttribute(item.requestId)}">
      <div class="editor-grid">
        <label>Client<select name="client">${renderOptions("Select client", "", editorOptions.clients, item.client)}</select></label>
        <label>Channel<select name="channel">${renderOptions("Select channel", "", editorOptions.channels, item.channel)}</select></label>
      </div>
      <div class="editor-grid">
        <label>Campaign name<input type="text" name="campaign_label" value="${escapeAttribute(item.campaignLabel || item.utmCampaign || "")}" placeholder="spring sale"></label>
        <label>Destination page URL<input type="url" name="destination_url" value="${escapeAttribute(item.destinationUrl)}" placeholder="https://example.com/page"></label>
      </div>
      <div class="editor-grid wide">
        <label>Source<input type="text" name="utm_source" value="${escapeAttribute(item.utmSource)}" placeholder="Leave blank to use the default"></label>
        <label>Medium<input type="text" name="utm_medium" value="${escapeAttribute(item.utmMedium)}" placeholder="Leave blank to use the default"></label>
        <label>Campaign<input type="text" name="utm_campaign" value="${escapeAttribute(item.utmCampaign)}" placeholder="Leave blank to use the default"></label>
      </div>
      <div class="editor-grid">
        <label>Term<input type="text" name="utm_term" value="${escapeAttribute(item.utmTerm)}" placeholder="Leave empty if not used"></label>
        <label>Content<input type="text" name="utm_content" value="${escapeAttribute(item.utmContent)}" placeholder="Leave empty if not used"></label>
      </div>
      <label class="checkbox"><input type="checkbox" name="needs_qr"${item.hasQr ? " checked" : ""}>Create a QR code for this saved version</label>
      <div class="actions">
        <button class="button" type="submit" data-submit>Save Changes</button>
        <button class="link-button" type="reset">Reset Form</button>
        <div class="form-status" data-form-status></div>
      </div>
    </form>
  </div>`;
}

function buildCampaignMeta(item, campaignValue) {
  const candidates = [
    item.campaignLabel,
    item.canonicalCampaign
  ].map((value) => String(value ?? "").trim()).filter(Boolean);

  const firstDifferent = candidates.find((value) => normalizeComparable(value) !== normalizeComparable(campaignValue));
  if (firstDifferent) {
    return `Label: ${firstDifferent}`;
  }

  if (item.utmTerm && item.utmContent) {
    return `Term ${item.utmTerm} · Content ${item.utmContent}`;
  }

  if (item.utmTerm) {
    return `Term ${item.utmTerm}`;
  }

  if (item.utmContent) {
    return `Content ${item.utmContent}`;
  }

  return "";
}

function renderOptions(defaultLabel, defaultValue, values, selected) {
  const options = [`<option value="${escapeHtml(defaultValue)}"${selected === defaultValue ? " selected" : ""}>${escapeHtml(defaultLabel)}</option>`];
  values.forEach((value) => {
    options.push(`<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(humanize(value))}</option>`);
  });
  return options.join("");
}

function renderTextOptions(defaultLabel, defaultValue, values, selected) {
  const options = [`<option value="${escapeHtml(defaultValue)}"${selected === defaultValue ? " selected" : ""}>${escapeHtml(defaultLabel)}</option>`];
  values.forEach((value) => {
    options.push(`<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(value)}</option>`);
  });
  return options.join("");
}

function renderToggleOptions(values, selected) {
  return values
    .map((value) => `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(TOGGLE_LABELS[value] ?? humanize(value))}</option>`)
    .join("");
}

function renderSortOptions(values, selected) {
  return values
    .map((value) => `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(SORT_LABELS[value] ?? humanize(value))}</option>`)
    .join("");
}

function renderPerPageOptions(selected) {
  return [12, 24, 48, 96]
    .map((value) => `<option value="${value}"${selected === value ? " selected" : ""}>${value}</option>`)
    .join("");
}

function renderChip(value, tone = "default") {
  if (!value) {
    return "";
  }

  const toneClass = tone === "warning"
    ? " warning"
    : tone === "error"
      ? " error"
      : tone === "neutral"
        ? " neutral"
        : "";

  return `<span class="chip${toneClass}">${escapeHtml(humanize(value))}</span>`;
}

function renderStatusChip(status) {
  if (!status) {
    return "";
  }

  const label = status === "completed_without_short_link"
    ? "Saved without short link"
    : status === "completed"
      ? "Saved"
      : humanize(status);
  return renderChip(label, status === "completed_without_short_link" ? "warning" : "default");
}

function renderUtmTile(label, value) {
  const display = value === "" ? "(empty)" : value || "--";
  return `<div class="utm-tile"><strong>${escapeHtml(label)}</strong><div class="utm-value">${escapeHtml(display)}</div></div>`;
}

function renderLinkItem(label, url) {
  if (!url) {
    return `<div class="link-item"><div class="link-label">${escapeHtml(label)}</div><div class="meta">Not available for this record.</div></div>`;
  }

  return `<div class="link-item">
    <div class="link-label">${escapeHtml(label)}</div>
    <div class="link-target">
      <a class="link-value" href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>
      <div class="mini-actions">
        <a class="subtle-link" href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">Open</a>
        ${renderCopyButton(url)}
      </div>
    </div>
  </div>`;
}

function renderQrPanel(item) {
  if (!item.qrUrl) {
    return `<div class="section"><div class="qr-frame"><div class="qr-placeholder">No QR generated for this link yet. Open the editor below and enable QR to create one.</div></div></div>`;
  }

  return `<div class="section">
    <a class="qr-frame" href="${escapeAttribute(item.qrUrl)}" target="_blank" rel="noreferrer">
      <img src="${escapeAttribute(item.qrUrl)}" alt="QR preview for ${escapeAttribute(item.clientDisplayName)} ${escapeAttribute(item.utmCampaign || item.canonicalCampaign || "link")}">
    </a>
    <div class="mini-actions">
      <a class="subtle-link" href="${escapeAttribute(item.qrUrl)}" target="_blank" rel="noreferrer">Open QR</a>
      ${renderCopyButton(item.qrUrl)}
    </div>
  </div>`;
}

function renderUsageItem(label, value) {
  return `<div class="usage-item"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value || "--")}</span></div>`;
}

function renderWarnings(warnings) {
  if (!warnings || warnings.length === 0) {
    return "";
  }

  return `<div class="warnings">${warnings.map((warning) => `<span class="chip warning">${escapeHtml(warning)}</span>`).join("")}</div>`;
}

function renderCopyButton(value) {
  return `<button type="button" class="mini-button" data-copy="${escapeAttribute(value)}">Copy</button>`;
}

function renderPaginationLinks(pagination, queryBase) {
  const links = [];

  if (pagination.hasPreviousPage) {
    links.push(`<a class="link-button" href="/utms?${buildQueryString({ ...queryBase, page: pagination.page - 1 })}">Previous</a>`);
  }

  buildPageWindow(pagination.page, pagination.pageCount).forEach((entry) => {
    if (entry === "...") {
      links.push(`<span class="meta">...</span>`);
      return;
    }

    if (entry === pagination.page) {
      links.push(`<span class="page-link current">${entry}</span>`);
      return;
    }

    links.push(`<a class="page-link" href="/utms?${buildQueryString({ ...queryBase, page: entry })}">${entry}</a>`);
  });

  if (pagination.hasNextPage) {
    links.push(`<a class="link-button" href="/utms?${buildQueryString({ ...queryBase, page: pagination.page + 1 })}">Next</a>`);
  }

  return links.join("");
}

function buildPageWindow(page, pageCount) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((left, right) => left - right);
  const result = [];

  for (let index = 0; index < sorted.length; index += 1) {
    if (index > 0 && sorted[index] - sorted[index - 1] > 1) {
      result.push("...");
    }
    result.push(sorted[index]);
  }

  return result;
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

function normalizeTextValue(value) {
  return String(value ?? "").trim();
}

function normalizeToastLevel(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["warning", "error"].includes(normalized)) {
    return normalized;
  }
  return "success";
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildQueryString(query) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "" || value === "all") {
      return;
    }

    params.set(key, String(value));
  });
  return params.toString();
}

function humanize(value) {
  return String(value ?? "")
    .split(/[_-]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeComparable(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
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

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/gu, "\"\"")}"`;
}
