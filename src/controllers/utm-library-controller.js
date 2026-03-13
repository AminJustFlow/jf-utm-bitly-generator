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

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>UTM Library</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f3efe6;
      --panel: rgba(255, 252, 246, 0.92);
      --panel-strong: #fffdf8;
      --ink: #1e2c2b;
      --muted: #61706d;
      --accent: #0e6b5c;
      --accent-soft: rgba(14, 107, 92, 0.12);
      --line: rgba(30, 44, 43, 0.12);
      --warning: #8b5d00;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: "Segoe UI Variable Text", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(14, 107, 92, 0.16), transparent 32rem),
        linear-gradient(180deg, #fbf8f2 0%, var(--bg) 100%);
    }

    .shell {
      max-width: 1440px;
      margin: 0 auto;
      padding: 2rem 1.25rem 3rem;
    }

    .hero {
      display: grid;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .hero-card,
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 1.25rem;
      box-shadow: 0 18px 50px rgba(26, 40, 39, 0.08);
      backdrop-filter: blur(12px);
    }

    .hero-card {
      padding: 1.35rem;
    }

    h1 {
      margin: 0 0 0.4rem;
      font-size: clamp(1.8rem, 3vw, 3rem);
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .lede {
      margin: 0;
      max-width: 60rem;
      color: var(--muted);
      font-size: 1rem;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      gap: 0.9rem;
      margin-top: 1rem;
    }

    .stat {
      padding: 1rem;
      border-radius: 1rem;
      background: var(--panel-strong);
      border: 1px solid var(--line);
    }

    .stat strong {
      display: block;
      font-size: 1.65rem;
      letter-spacing: -0.04em;
    }

    .stat span {
      color: var(--muted);
      font-size: 0.92rem;
    }

    .panel {
      padding: 1rem;
      margin-bottom: 1rem;
    }

    .filters {
      display: grid;
      gap: 0.9rem;
      grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
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
      border: 1px solid rgba(30, 44, 43, 0.18);
      border-radius: 0.8rem;
      padding: 0.8rem 0.9rem;
      background: #fff;
      color: var(--ink);
      font: inherit;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
    }

    .button,
    .link-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2.8rem;
      padding: 0.8rem 1rem;
      border-radius: 999px;
      border: 1px solid var(--line);
      font: inherit;
      text-decoration: none;
      cursor: pointer;
    }

    .button {
      background: var(--accent);
      color: #fff;
      border-color: transparent;
    }

    .link-button {
      background: transparent;
      color: var(--ink);
    }

    .table-wrap {
      overflow-x: auto;
      border-radius: 1rem;
      border: 1px solid var(--line);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 1100px;
      background: var(--panel-strong);
    }

    th,
    td {
      padding: 0.95rem 0.9rem;
      vertical-align: top;
      border-bottom: 1px solid var(--line);
      text-align: left;
      font-size: 0.93rem;
    }

    th {
      position: sticky;
      top: 0;
      background: #f9f6ef;
      z-index: 1;
      color: var(--muted);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    tr:last-child td {
      border-bottom: 0;
    }

    .identity strong,
    .campaign strong {
      display: block;
      font-size: 1rem;
      margin-bottom: 0.25rem;
    }

    .muted,
    .meta,
    .empty {
      color: var(--muted);
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin: 0.35rem 0 0;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.55rem;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 0.78rem;
      line-height: 1.2;
    }

    .chip.status-warning {
      background: rgba(139, 93, 0, 0.12);
      color: var(--warning);
    }

    .utm-grid {
      display: grid;
      gap: 0.35rem;
    }

    .utm-grid div {
      display: flex;
      gap: 0.4rem;
      align-items: baseline;
    }

    .utm-grid strong {
      min-width: 4.8rem;
      color: var(--muted);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .links {
      display: grid;
      gap: 0.45rem;
    }

    .links a {
      color: var(--accent);
      word-break: break-word;
    }

    .pagination {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
      margin-top: 1rem;
      flex-wrap: wrap;
    }

    .pagination nav {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .empty-state {
      padding: 2.5rem 1rem;
      text-align: center;
      color: var(--muted);
    }

    @media (max-width: 720px) {
      .shell {
        padding-inline: 0.9rem;
      }

      .panel,
      .hero-card {
        border-radius: 1rem;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div class="hero-card">
        <h1>UTM Library</h1>
        <p class="lede">A read-only index of unique tracked links. Each row represents one fingerprinted UTM setup, not every duplicate request, so the team gets a cleaner library.</p>
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
          <a class="link-button" href="${csvHref}">Export CSV</a>
          <a class="link-button" href="${jsonHref}">JSON</a>
        </div>
      </form>
    </section>

    <section class="panel">
      <div class="table-wrap">
        ${library.items.length > 0 ? renderTable(library.items) : '<div class="empty-state">No UTM entries matched the current filters.</div>'}
      </div>
      <div class="pagination">
        <div class="meta">Page ${library.pagination.page} of ${library.pagination.pageCount} · ${library.pagination.total} result(s)</div>
        <nav>
          ${previousHref ? `<a class="link-button" href="${previousHref}">Previous</a>` : ""}
          ${nextHref ? `<a class="link-button" href="${nextHref}">Next</a>` : ""}
        </nav>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function renderTable(items) {
  const rows = items.map((item) => `
    <tr>
      <td>
        <strong>${escapeHtml(formatDate(item.lastCreatedAt))}</strong>
        <div class="meta">First seen ${escapeHtml(formatDate(item.firstCreatedAt))}</div>
      </td>
      <td class="identity">
        <strong>${escapeHtml(item.clientDisplayName)}</strong>
        <div class="muted">${escapeHtml(item.channelDisplayName)}</div>
        <div class="chips">
          ${renderChip(item.assetType)}
          ${renderStatusChip(item.status)}
        </div>
      </td>
      <td class="campaign">
        <strong>${escapeHtml(item.utmCampaign || item.canonicalCampaign || "(none)")}</strong>
        <div class="muted">${escapeHtml(item.campaignLabel || item.canonicalCampaign || "")}</div>
      </td>
      <td>
        <div class="utm-grid">
          ${renderUtmRow("Source", item.utmSource)}
          ${renderUtmRow("Medium", item.utmMedium)}
          ${renderUtmRow("Campaign", item.utmCampaign)}
          ${renderUtmRow("Term", item.utmTerm)}
          ${renderUtmRow("Content", item.utmContent)}
        </div>
      </td>
      <td>
        <div class="links">
          ${renderLinkLine("Destination", item.destinationUrl)}
          ${renderLinkLine("Tracked", item.finalLongUrl)}
          ${renderLinkLine("Short", item.shortUrl)}
          ${renderLinkLine("QR", item.qrUrl)}
        </div>
      </td>
      <td>
        <strong>${item.requestCount}</strong>
        <div class="meta">${item.reusedExisting ? "Reused existing short link" : "Created new short link"}</div>
        <div class="meta">Request #${item.requestId}</div>
        ${item.warnings.length > 0 ? `<div class="chips">${item.warnings.slice(0, 2).map((warning) => `<span class="chip status-warning">${escapeHtml(warning)}</span>`).join("")}</div>` : ""}
      </td>
    </tr>
  `).join("");

  return `<table>
    <thead>
      <tr>
        <th>When</th>
        <th>Client</th>
        <th>Campaign</th>
        <th>UTM Fields</th>
        <th>Links</th>
        <th>Usage</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
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

function renderUtmRow(label, value) {
  const display = value === "" ? "(empty)" : value || "—";
  return `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(display)}</span></div>`;
}

function renderLinkLine(label, url) {
  if (!url) {
    return `<div><span class="meta">${escapeHtml(label)}:</span> <span class="empty">—</span></div>`;
  }

  return `<div><span class="meta">${escapeHtml(label)}:</span> <a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a></div>`;
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
