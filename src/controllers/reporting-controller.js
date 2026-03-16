import { NodeResponse } from "../http/response.js";
import { renderAppHeader, renderAppShellStyles } from "./app-shell.js";

export class ReportingController {
  constructor({
    analyticsReportingService
  }) {
    this.analyticsReportingService = analyticsReportingService;
  }

  async handleHtml(request) {
    const filters = normalizeFilters(request.query);
    if (filters.websiteId) {
      this.analyticsReportingService.refreshWebsite(filters.websiteId);
    }
    const report = this.analyticsReportingService.buildReport({
      websiteId: filters.websiteId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      model: filters.model
    });

    return NodeResponse.text(renderHtml(report), 200, {
      "Content-Type": "text/html; charset=utf-8"
    });
  }

  async handleJson(request) {
    const filters = normalizeFilters(request.query);
    if (filters.websiteId) {
      this.analyticsReportingService.refreshWebsite(filters.websiteId);
    }

    return NodeResponse.json(this.analyticsReportingService.buildReport({
      websiteId: filters.websiteId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      model: filters.model
    }));
  }
}

function normalizeFilters(query) {
  return {
    websiteId: positiveInteger(query.website_id),
    dateFrom: normalizeDate(query.date_from),
    dateTo: normalizeDate(query.date_to),
    model: ["first_touch", "last_touch", "last_non_direct"].includes(String(query.model ?? ""))
      ? String(query.model)
      : "last_touch"
  };
}

function positiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeDate(value) {
  const normalized = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/u.test(normalized) ? normalized : null;
}

function renderHtml(report) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Attribution Reports</title>
  <style>
    :root{--bg:#f4efe5;--panel:rgba(255,250,242,.94);--panel-strong:rgba(255,255,255,.88);--ink:#17302a;--muted:#66766f;--accent:#0d6c5e;--line:rgba(23,48,42,.1);--shadow:0 24px 60px rgba(20,32,31,.09)}
    *{box-sizing:border-box} body{margin:0;color:var(--ink);font-family:"Aptos","Segoe UI",sans-serif;background:radial-gradient(circle at top left,rgba(13,108,94,.18),transparent 32rem),radial-gradient(circle at top right,rgba(183,142,65,.12),transparent 26rem),linear-gradient(180deg,#faf7f1 0%,var(--bg) 100%)}
    .shell{max-width:1480px;margin:0 auto;padding:1.4rem 1rem 3rem}
    ${renderAppShellStyles()}
    .hero,.panel,.card{background:var(--panel);border:1px solid var(--line);border-radius:1.35rem;box-shadow:var(--shadow)}
    .hero,.panel{padding:1rem 1.05rem;margin-bottom:1rem}
    .hero-top,.panel-head,.stats,.summary-grid,.tables{display:flex;gap:1rem;flex-wrap:wrap}
    .hero-top,.panel-head{justify-content:space-between;align-items:flex-end}
    h1,h2,h3{margin:0;font-family:"Aptos Display","Trebuchet MS",sans-serif}
    h1{font-size:clamp(2.1rem,4.8vw,3.2rem);letter-spacing:-.05em;line-height:.96}
    h2{font-size:1.2rem;letter-spacing:-.03em}
    .lede,.meta,.empty{color:var(--muted);line-height:1.5}
    .stats{margin-top:.4rem}
    .stat,.card{padding:.95rem 1rem;border-radius:1.05rem;background:var(--panel-strong)}
    .stat strong,.metric{display:block;font-size:1.68rem;letter-spacing:-.05em}
    .filters{display:grid;gap:.8rem;grid-template-columns:repeat(4,minmax(0,1fr));align-items:end}
    label{display:grid;gap:.35rem;font-size:.9rem;color:var(--muted)}
    input,select{width:100%;padding:.78rem .9rem;border:1px solid rgba(23,48,42,.14);border-radius:.95rem;background:rgba(255,255,255,.86);color:var(--ink);font:inherit}
    .button,.link-button{display:inline-flex;align-items:center;justify-content:center;min-height:2.8rem;padding:.78rem 1rem;border-radius:999px;border:1px solid var(--line);font:inherit;text-decoration:none;cursor:pointer;background:rgba(255,255,255,.72);color:var(--ink)}
    .button{background:var(--accent);border-color:transparent;color:#fff;box-shadow:0 12px 24px rgba(13,108,94,.18)}
    .summary-grid{display:grid;gap:1rem;grid-template-columns:repeat(4,minmax(0,1fr))}
    .card{border:1px solid var(--line)}
    .tables{align-items:flex-start}
    .table-card{flex:1 1 21rem;padding:.85rem .9rem;border:1px solid var(--line);border-radius:1rem;background:rgba(255,255,255,.76)}
    table{width:100%;border-collapse:collapse;font-size:.9rem}
    th,td{text-align:left;padding:.55rem .35rem;border-bottom:1px dashed rgba(23,48,42,.12);vertical-align:top}
    th{font-size:.76rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
    tr:last-child td{border-bottom:0}
    .empty{padding:2.8rem 1rem;text-align:center;border:1px dashed rgba(23,48,42,.16);border-radius:1.2rem;background:rgba(255,255,255,.55)}
    @media (max-width:1100px){.filters,.summary-grid{grid-template-columns:1fr 1fr}.tables{flex-direction:column}}
    @media (max-width:700px){.filters,.summary-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="shell">
    ${renderAppHeader("reports")}
    <section class="hero">
      <div class="hero-top">
        <div>
          <h1>Attribution Reports</h1>
          <p class="lede">Raw traffic rollups and attributed conversion rollups are recalculated from the central tracking tables. Current models: first touch, last touch, and last non-direct.</p>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><strong>${report.summary.sessions}</strong><span>Sessions</span></div>
        <div class="stat"><strong>${report.summary.pageviews}</strong><span>Pageviews</span></div>
        <div class="stat"><strong>${report.summary.attributed_conversions}</strong><span>Attributed conversions</span></div>
        <div class="stat"><strong>${formatCurrency(report.summary.attributed_conversion_value)}</strong><span>Attributed value</span></div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Filters</h2>
          <div class="meta">Select a website to refresh and inspect current rollups.</div>
        </div>
        <div><a class="link-button" href="/admin/reports.json?${buildQueryString(report.filters)}">Download JSON</a></div>
      </div>
      <form method="get" action="/admin/reports" class="filters">
        <label>Website<select name="website_id"><option value="">Select website</option>${report.websites.map((website) => `<option value="${website.id}"${report.filters.website_id === website.id ? " selected" : ""}>${escapeHtml(website.client_name)} • ${escapeHtml(website.website_name)}</option>`).join("")}</select></label>
        <label>Date From<input type="date" name="date_from" value="${escapeHtml(report.filters.date_from || "")}"></label>
        <label>Date To<input type="date" name="date_to" value="${escapeHtml(report.filters.date_to || "")}"></label>
        <label>Model<select name="model"><option value="first_touch"${report.filters.model === "first_touch" ? " selected" : ""}>First touch</option><option value="last_touch"${report.filters.model === "last_touch" ? " selected" : ""}>Last touch</option><option value="last_non_direct"${report.filters.model === "last_non_direct" ? " selected" : ""}>Last non-direct</option></select></label>
        <div><button class="button" type="submit">Refresh Report</button></div>
      </form>
    </section>
    ${report.filters.website_id ? `<section class="panel"><div class="summary-grid"><div class="card"><span class="metric">${report.summary.visitors}</span><span>Visitors</span></div><div class="card"><span class="metric">${report.summary.events}</span><span>Events</span></div><div class="card"><span class="metric">${report.summary.engaged_sessions}</span><span>Engaged sessions</span></div><div class="card"><span class="metric">${report.summary.raw_conversions}</span><span>Raw conversions</span></div></div></section>` : `<div class="empty">Select a website to build the report.</div>`}
    ${report.filters.website_id ? `<section class="tables"><div class="table-card"><h2>Daily Series</h2>${renderTimeseries(report.timeseries)}</div><div class="table-card"><h2>Top Channels</h2>${renderBreakdown(report.breakdowns.channels)}</div><div class="table-card"><h2>Top Sources</h2>${renderBreakdown(report.breakdowns.sources)}</div><div class="table-card"><h2>Top Campaigns</h2>${renderBreakdown(report.breakdowns.campaigns)}</div></section><section class="panel"><h2>Recent Conversions</h2>${renderRecentConversions(report.recent_conversions)}</section>` : ""}
  </main>
</body>
</html>`;
}

function renderTimeseries(rows) {
  if (!rows.length) {
    return `<div class="meta">No rollup data is available for this date range.</div>`;
  }

  return `<table><thead><tr><th>Date</th><th>Visitors</th><th>Sessions</th><th>Pageviews</th><th>Events</th><th>Attributed Conversions</th><th>Value</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${row.visitors}</td><td>${row.sessions}</td><td>${row.pageviews}</td><td>${row.events}</td><td>${row.attributed_conversions}</td><td>${formatCurrency(row.attributed_conversion_value)}</td></tr>`).join("")}</tbody></table>`;
}

function renderBreakdown(rows) {
  if (!rows.length) {
    return `<div class="meta">No attributed conversion data is available.</div>`;
  }

  return `<table><thead><tr><th>Label</th><th>Conversions</th><th>Value</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.conversions}</td><td>${formatCurrency(row.conversion_value)}</td></tr>`).join("")}</tbody></table>`;
}

function renderRecentConversions(rows) {
  if (!rows.length) {
    return `<div class="meta">No conversions matched the current filters.</div>`;
  }

  return `<table><thead><tr><th>Submitted</th><th>Type</th><th>Campaign</th><th>Channel</th><th>Value</th><th>Page</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(formatDate(row.submitted_at))}</td><td>${escapeHtml(row.conversion_type)}</td><td>${escapeHtml(row.utm_campaign || "(none)")}</td><td>${escapeHtml(row.channel || "(none)")}</td><td>${formatCurrency(row.value)}</td><td>${escapeHtml(row.page_url || "--")}</td></tr>`).join("")}</tbody></table>`;
}

function buildQueryString(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return;
    }
    params.set(key, String(value));
  });
  return params.toString();
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

function formatCurrency(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(amount);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}
