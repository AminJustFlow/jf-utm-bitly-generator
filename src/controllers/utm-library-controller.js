import { NodeResponse } from "../http/response.js";

export class UtmLibraryController {
  constructor(utmLibraryService) {
    this.utmLibraryService = utmLibraryService;
  }

  async handleHtml(request) {
    const library = this.utmLibraryService.list(request.query);

    return NodeResponse.text(renderHtml(library), 200, {
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
}

function renderHtml(library) {
  const queryBase = {
    client: library.filters.client,
    channel: library.filters.channel,
    campaign: library.filters.campaign,
    status: library.filters.status,
    search: library.filters.search,
    per_page: library.filters.perPage
  };
  const csvHref = `/utms.csv?${buildQueryString({ ...queryBase, page: 1 })}`;
  const jsonHref = `/utms.json?${buildQueryString({ ...queryBase, page: library.pagination.page })}`;
  const previousHref = library.pagination.hasPreviousPage
    ? `/utms?${buildQueryString({ ...queryBase, page: library.pagination.page - 1 })}`
    : null;
  const nextHref = library.pagination.hasNextPage
    ? `/utms?${buildQueryString({ ...queryBase, page: library.pagination.page + 1 })}`
    : null;
  const activeFilterCount = [
    library.filters.search,
    library.filters.client,
    library.filters.channel,
    library.filters.campaign,
    library.filters.status !== "all" ? library.filters.status : ""
  ].filter(Boolean).length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>UTM Library</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4efe5;
      --bg-strong: #faf6ee;
      --panel: rgba(255, 251, 244, 0.9);
      --panel-strong: #fffdf8;
      --ink: #18302a;
      --muted: #63736c;
      --accent: #0d6857;
      --accent-strong: #0b5547;
      --accent-soft: rgba(13, 104, 87, 0.11);
      --accent-glow: rgba(13, 104, 87, 0.18);
      --line: rgba(24, 48, 42, 0.11);
      --shadow: 0 24px 60px rgba(26, 40, 39, 0.08);
      --warning: #936108;
      --warning-soft: rgba(147, 97, 8, 0.12);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: "Aptos", "Segoe UI Variable Text", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(13, 104, 87, 0.22), transparent 30rem),
        radial-gradient(circle at top right, rgba(166, 123, 39, 0.12), transparent 26rem),
        linear-gradient(180deg, #fbf8f2 0%, var(--bg) 100%);
    }

    .shell {
      max-width: 1380px;
      margin: 0 auto;
      padding: 1.75rem 1.2rem 3rem;
    }

    .hero {
      display: grid;
      gap: 1.1rem;
      margin-bottom: 1.5rem;
    }

    .hero-card,
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 1.4rem;
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
    }

    .hero-card {
      padding: 1.4rem;
      display: grid;
      gap: 1rem;
    }

    .hero-top {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 1rem;
      align-items: end;
    }

    h1 {
      margin: 0 0 0.4rem;
      font-family: "Aptos Display", "Segoe UI Variable Display", "Trebuchet MS", sans-serif;
      font-size: clamp(2.1rem, 4vw, 3.5rem);
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .lede {
      margin: 0;
      max-width: 48rem;
      color: var(--muted);
      font-size: 1.02rem;
      line-height: 1.5;
    }

    .hero-actions,
    .actions,
    .pagination-actions,
    .mini-actions,
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
    }

    .summary-badge,
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.74);
      border: 1px solid var(--line);
      font-size: 0.82rem;
      line-height: 1.2;
    }

    .summary-badge {
      color: var(--muted);
    }

    .summary-badge strong {
      color: var(--accent-strong);
    }

    .chip {
      background: var(--accent-soft);
      color: var(--accent);
    }

    .chip.status-warning {
      background: var(--warning-soft);
      color: var(--warning);
    }

    .chip.count-chip {
      background: rgba(24, 48, 42, 0.08);
      color: var(--ink);
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      gap: 0.9rem;
    }

    .stat {
      padding: 1rem 1.05rem;
      border-radius: 1.15rem;
      background: var(--panel-strong);
      border: 1px solid var(--line);
    }

    .stat strong {
      display: block;
      font-size: 1.8rem;
      letter-spacing: -0.04em;
    }

    .stat span {
      color: var(--muted);
      font-size: 0.92rem;
    }

    .panel {
      padding: 1rem 1.05rem;
      margin-bottom: 1rem;
    }

    .panel-heading,
    .results-summary {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      align-items: end;
      margin-bottom: 0.95rem;
    }

    .panel-heading h2,
    .results-summary h2 {
      margin: 0;
      font-family: "Aptos Display", "Segoe UI Variable Display", "Trebuchet MS", sans-serif;
      font-size: 1.3rem;
      letter-spacing: -0.03em;
    }

    .meta,
    .muted,
    .empty {
      color: var(--muted);
      line-height: 1.45;
    }

    .meta {
      font-size: 0.9rem;
    }

    .filters {
      display: grid;
      gap: 0.9rem 0.95rem;
      grid-template-columns: minmax(14rem, 1.3fr) repeat(4, minmax(9rem, 1fr)) minmax(7rem, 0.8fr);
      align-items: end;
    }

    label {
      display: grid;
      gap: 0.35rem;
      font-size: 0.9rem;
      color: var(--muted);
    }

    input,
    select {
      width: 100%;
      border: 1px solid rgba(24, 48, 42, 0.14);
      border-radius: 0.9rem;
      padding: 0.8rem 0.9rem;
      background: rgba(255, 255, 255, 0.88);
      color: var(--ink);
      font: inherit;
      transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease;
    }

    input:focus,
    select:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-glow);
      background: #fff;
    }

    .button,
    .link-button,
    .mini-button,
    .subtle-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      border: 1px solid var(--line);
      font: inherit;
      text-decoration: none;
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease, background 120ms ease;
    }

    .button,
    .link-button {
      min-height: 2.8rem;
      padding: 0.8rem 1rem;
    }

    .mini-button,
    .subtle-link {
      min-height: 2.1rem;
      padding: 0.45rem 0.75rem;
      background: rgba(255, 255, 255, 0.84);
      color: var(--ink);
      font-size: 0.82rem;
    }

    .button {
      background: var(--accent);
      color: #fff;
      border-color: transparent;
      box-shadow: 0 12px 24px rgba(13, 104, 87, 0.18);
    }

    .link-button {
      background: rgba(255, 255, 255, 0.72);
      color: var(--ink);
    }

    .button:hover,
    .link-button:hover,
    .mini-button:hover,
    .subtle-link:hover {
      transform: translateY(-1px);
    }

    .results-grid {
      display: grid;
      gap: 1rem;
    }

    .result-card {
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 250, 242, 0.92));
      border: 1px solid var(--line);
      border-radius: 1.3rem;
      padding: 1.1rem;
      box-shadow: 0 14px 30px rgba(26, 40, 39, 0.05);
      display: grid;
      gap: 1rem;
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      align-items: start;
    }

    .card-title {
      display: grid;
      gap: 0.35rem;
    }

    .eyebrow {
      color: var(--muted);
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .card-title h3 {
      margin: 0;
      font-size: 1.35rem;
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .card-subtitle {
      color: var(--muted);
      font-size: 0.96rem;
    }

    .campaign-banner {
      display: grid;
      gap: 0.35rem;
      padding: 1rem 1.05rem;
      border-radius: 1.05rem;
      background: linear-gradient(135deg, rgba(13, 104, 87, 0.08), rgba(255, 255, 255, 0.66));
      border: 1px solid rgba(13, 104, 87, 0.12);
    }

    .campaign-label {
      font-size: 0.82rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .campaign-value {
      font-size: clamp(1.1rem, 2vw, 1.5rem);
      line-height: 1.05;
      letter-spacing: -0.04em;
      font-weight: 700;
      word-break: break-word;
    }

    .card-grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: minmax(16rem, 1.2fr) minmax(18rem, 1.45fr) minmax(11rem, 0.9fr);
    }

    .stack,
    .qr-panel {
      min-width: 0;
      display: grid;
      gap: 0.8rem;
      align-content: start;
    }

    .stack h4 {
      margin: 0;
      font-size: 0.88rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }

    .utm-grid {
      display: grid;
      gap: 0.6rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .utm-tile {
      border: 1px solid var(--line);
      border-radius: 0.95rem;
      padding: 0.8rem 0.85rem;
      background: rgba(255, 255, 255, 0.7);
      min-height: 4.75rem;
    }

    .utm-tile strong {
      display: block;
      margin-bottom: 0.45rem;
      color: var(--muted);
      font-size: 0.78rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .utm-value {
      font-size: 0.98rem;
      line-height: 1.35;
      word-break: break-word;
    }

    .link-list,
    .usage-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .link-item {
      display: grid;
      gap: 0.42rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px dashed rgba(24, 48, 42, 0.1);
    }

    .link-item:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .link-label {
      color: var(--muted);
      font-size: 0.82rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .link-target {
      display: flex;
      gap: 0.75rem;
      align-items: start;
      justify-content: space-between;
      flex-wrap: wrap;
    }

    .link-value {
      min-width: 0;
      flex: 1 1 16rem;
      color: var(--accent-strong);
      text-decoration: none;
      word-break: break-word;
      line-height: 1.45;
    }

    .link-value:hover {
      text-decoration: underline;
    }

    .qr-frame {
      aspect-ratio: 1;
      width: min(100%, 12rem);
      border-radius: 1.15rem;
      border: 1px solid var(--line);
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(243, 239, 229, 0.9));
      display: grid;
      place-items: center;
      overflow: hidden;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
    }

    .qr-frame img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background: #fff;
    }

    .qr-placeholder {
      padding: 1rem;
      text-align: center;
      font-size: 0.92rem;
      line-height: 1.5;
      color: var(--muted);
    }

    .usage-item {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      align-items: baseline;
      padding-bottom: 0.55rem;
      border-bottom: 1px dashed rgba(24, 48, 42, 0.1);
    }

    .usage-item:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .usage-item strong {
      color: var(--muted);
      font-size: 0.84rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .usage-item span {
      text-align: right;
      line-height: 1.4;
    }

    .warning-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }

    .request-details {
      border-top: 1px dashed rgba(24, 48, 42, 0.12);
      padding-top: 0.9rem;
    }

    .request-details summary {
      cursor: pointer;
      color: var(--muted);
      font-size: 0.9rem;
      list-style: none;
    }

    .request-details summary::-webkit-details-marker {
      display: none;
    }

    .request-details[open] summary {
      margin-bottom: 0.6rem;
    }

    .request-message {
      margin: 0;
      padding: 0.8rem 0.9rem;
      border-radius: 0.95rem;
      background: rgba(255, 255, 255, 0.74);
      border: 1px solid var(--line);
      color: var(--ink);
      line-height: 1.55;
      word-break: break-word;
    }

    .pagination {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
      margin-top: 0.35rem;
      flex-wrap: wrap;
    }

    .empty-state {
      padding: 3.25rem 1rem;
      text-align: center;
      color: var(--muted);
      border: 1px dashed rgba(24, 48, 42, 0.16);
      border-radius: 1.2rem;
      background: rgba(255, 255, 255, 0.55);
    }

    .toast {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      max-width: 20rem;
      padding: 0.8rem 1rem;
      border-radius: 0.95rem;
      background: rgba(24, 48, 42, 0.92);
      color: #fff;
      box-shadow: 0 18px 36px rgba(24, 48, 42, 0.28);
      opacity: 0;
      pointer-events: none;
      transform: translateY(12px);
      transition: opacity 140ms ease, transform 140ms ease;
    }

    .toast.visible {
      opacity: 1;
      transform: translateY(0);
    }

    @media (max-width: 1160px) {
      .filters {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .card-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .card-grid .qr-column {
        grid-column: span 2;
      }
    }

    @media (max-width: 720px) {
      .shell {
        padding-inline: 0.9rem;
      }

      .hero-card,
      .panel,
      .result-card {
        border-radius: 1rem;
      }

      .filters,
      .card-grid,
      .utm-grid {
        grid-template-columns: 1fr;
      }

      .card-top,
      .results-summary,
      .usage-item,
      .link-target {
        display: grid;
      }

      .usage-item span {
        text-align: left;
      }

      .card-grid .qr-column {
        grid-column: auto;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div class="hero-card">
        <div class="hero-top">
          <div>
            <h1>UTM Library</h1>
            <p class="lede">Browse the real link library, not the raw webhook log. Duplicate requests collapse into one record, QR-enabled links show a live preview, and each card keeps the important fields easy to scan.</p>
          </div>
          <div class="hero-actions">
            <span class="summary-badge"><strong>${activeFilterCount}</strong> active filter${activeFilterCount === 1 ? "" : "s"}</span>
            <a class="link-button" href="${csvHref}">Export CSV</a>
            <a class="link-button" href="${jsonHref}">JSON</a>
          </div>
        </div>
        <div class="stats">
          <div class="stat">
            <strong>${library.summary.totalUniqueLinks}</strong>
            <span>Unique tracked links</span>
          </div>
          <div class="stat">
            <strong>${library.summary.filteredLinks}</strong>
            <span>Results after filters</span>
          </div>
          <div class="stat">
            <strong>${library.summary.requestsRepresented}</strong>
            <span>Total requests represented</span>
          </div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2>Filter Library</h2>
          <div class="meta">Search by client, campaign, UTM field, or URL. Filters also carry into export links.</div>
        </div>
      </div>
      <form method="get" action="/utms" class="filters">
        <label>
          Search
          <input type="search" name="search" value="${escapeHtml(library.filters.search)}" placeholder="Client, campaign, source, medium, URL, message">
        </label>
        <label>
          Client
          <select name="client">
            ${renderOptions("All clients", "", library.available.clients, library.filters.client)}
          </select>
        </label>
        <label>
          Channel
          <select name="channel">
            ${renderOptions("All channels", "", library.available.channels, library.filters.channel)}
          </select>
        </label>
        <label>
          Campaign
          <input type="text" name="campaign" value="${escapeHtml(library.filters.campaign)}" placeholder="spring_sale">
        </label>
        <label>
          Status
          <select name="status">
            ${renderOptions("All statuses", "all", library.available.statuses.filter((status) => status !== "all"), library.filters.status)}
          </select>
        </label>
        <label>
          Rows
          <select name="per_page">
            ${renderPerPageOptions(library.filters.perPage)}
          </select>
        </label>
        <input type="hidden" name="page" value="1">
        <div class="actions">
          <button class="button" type="submit">Apply Filters</button>
          <a class="link-button" href="/utms">Reset</a>
        </div>
      </form>
    </section>

    <section class="panel">
      <div class="results-summary">
        <div>
          <h2>Results</h2>
          <div class="meta">Page ${library.pagination.page} of ${library.pagination.pageCount} - ${library.pagination.total} result(s)</div>
        </div>
        <div class="chips">
          <span class="chip count-chip">${library.summary.filteredLinks} visible</span>
          <span class="chip count-chip">${library.summary.requestsRepresented} request${library.summary.requestsRepresented === 1 ? "" : "s"} represented</span>
        </div>
      </div>
      <div class="results-grid">
        ${library.items.length > 0 ? renderResults(library.items) : '<div class="empty-state">No UTM entries matched the current filters.</div>'}
      </div>
      <div class="pagination">
        <div class="meta">Tip: use the copy buttons to grab tracked URLs, short links, and QR image URLs directly from the library.</div>
        <div class="pagination-actions">
          ${previousHref ? `<a class="link-button" href="${previousHref}">Previous</a>` : ""}
          ${nextHref ? `<a class="link-button" href="${nextHref}">Next</a>` : ""}
        </div>
      </div>
    </section>
  </main>
  <div class="toast" id="toast" aria-live="polite"></div>
  <script>
    (function () {
      const toast = document.getElementById("toast");
      let toastTimer = null;

      function showToast(message) {
        if (!toast) {
          return;
        }

        toast.textContent = message;
        toast.classList.add("visible");
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
          toast.classList.remove("visible");
        }, 1800);
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
        if (!button) {
          return;
        }

        event.preventDefault();
        try {
          const ok = await copyText(button.getAttribute("data-copy") || "");
          showToast(ok ? "Copied to clipboard" : "Copy failed");
        } catch {
          showToast("Copy failed");
        }
      });
    })();
  </script>
</body>
</html>`;
}

function renderResults(items) {
  return items.map((item) => renderResultCard(item)).join("");
}

function renderResultCard(item) {
  const campaignValue = item.utmCampaign || item.canonicalCampaign || "(none)";
  const subtitleParts = [item.channelDisplayName, item.assetType ? humanize(item.assetType) : ""].filter(Boolean);

  return `<article class="result-card">
    <div class="card-top">
      <div class="card-title">
        <div class="eyebrow">Last seen ${escapeHtml(formatDate(item.lastCreatedAt))}</div>
        <h3>${escapeHtml(item.clientDisplayName)}</h3>
        <div class="card-subtitle">${escapeHtml(subtitleParts.join(" - "))}</div>
      </div>
      <div class="chips">
        ${renderChip(item.assetType)}
        ${renderStatusChip(item.status)}
        <span class="chip count-chip">${item.requestCount} request${item.requestCount === 1 ? "" : "s"}</span>
      </div>
    </div>
    <div class="campaign-banner">
      <div class="campaign-label">Campaign</div>
      <div class="campaign-value">${escapeHtml(campaignValue)}</div>
      <div class="meta">${escapeHtml(item.campaignLabel || item.canonicalCampaign || "No source campaign label captured.")}</div>
    </div>
    <div class="card-grid">
      <section class="stack">
        <h4>UTM Fields</h4>
        <div class="utm-grid">
          ${renderUtmTile("Source", item.utmSource)}
          ${renderUtmTile("Medium", item.utmMedium)}
          ${renderUtmTile("Campaign", item.utmCampaign)}
          ${renderUtmTile("Term", item.utmTerm)}
          ${renderUtmTile("Content", item.utmContent)}
        </div>
      </section>
      <section class="stack">
        <h4>Links</h4>
        <div class="link-list">
          ${renderLinkItem("Destination", item.destinationUrl)}
          ${renderLinkItem("Tracked URL", item.finalLongUrl)}
          ${renderLinkItem("Short Link", item.shortUrl)}
        </div>
      </section>
      <section class="stack qr-column">
        <div class="qr-panel">
          <h4>QR Preview</h4>
          ${renderQrPanel(item)}
        </div>
        <div class="stack">
          <h4>Usage</h4>
          <div class="usage-list">
            ${renderUsageItem("Request ID", `#${item.requestId}`)}
            ${renderUsageItem("Created", item.reusedExisting ? "Reused existing short link" : "Created new link response")}
            ${renderUsageItem("First seen", formatDate(item.firstCreatedAt))}
          </div>
          ${renderWarnings(item.warnings)}
        </div>
      </section>
    </div>
    <details class="request-details">
      <summary>Original request</summary>
      <p class="request-message">${escapeHtml(item.originalMessage || "No original message stored.")}</p>
    </details>
  </article>`;
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

function renderOptions(defaultLabel, defaultValue, values, selected) {
  const options = [`<option value="${escapeHtml(defaultValue)}"${selected === defaultValue ? " selected" : ""}>${escapeHtml(defaultLabel)}</option>`];
  values.forEach((value) => {
    options.push(`<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(humanize(value))}</option>`);
  });
  return options.join("");
}

function renderPerPageOptions(selected) {
  return [25, 50, 100, 200]
    .map((value) => `<option value="${value}"${selected === value ? " selected" : ""}>${value}</option>`)
    .join("");
}

function renderChip(value) {
  if (!value) {
    return "";
  }

  return `<span class="chip">${escapeHtml(humanize(value))}</span>`;
}

function renderStatusChip(status) {
  if (!status) {
    return "";
  }

  const label = status === "completed_without_short_link"
    ? "No short link"
    : humanize(status);

  return `<span class="chip${status === "completed_without_short_link" ? " status-warning" : ""}">${escapeHtml(label)}</span>`;
}

function renderUtmTile(label, value) {
  const display = value === "" ? "(empty)" : value || "--";
  return `<div class="utm-tile"><strong>${escapeHtml(label)}</strong><div class="utm-value">${escapeHtml(display)}</div></div>`;
}

function renderLinkItem(label, url) {
  if (!url) {
    return `<div class="link-item">
      <div class="link-label">${escapeHtml(label)}</div>
      <div class="meta">Not available for this record.</div>
    </div>`;
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
    return `<div class="qr-frame"><div class="qr-placeholder">No QR generated for this request yet.</div></div>`;
  }

  return `<div class="stack">
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

  return `<div class="warning-list">${warnings.map((warning) => `<span class="chip status-warning">${escapeHtml(warning)}</span>`).join("")}</div>`;
}

function renderCopyButton(value) {
  return `<button type="button" class="mini-button" data-copy="${escapeAttribute(value)}">Copy</button>`;
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
