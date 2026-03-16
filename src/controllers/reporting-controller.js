import { NodeResponse } from "../http/response.js";
import { renderAppHeader, renderAppShellStyles } from "./app-shell.js";

export class ReportingController {
  constructor({
    analyticsReportingService,
    analyticsRefreshService = null
  }) {
    this.analyticsReportingService = analyticsReportingService;
    this.analyticsRefreshService = analyticsRefreshService;
  }

  async handleHtml(request) {
    const report = this.buildReportResponse(request.query);

    return NodeResponse.text(renderHtml(report), 200, {
      "Content-Type": "text/html; charset=utf-8"
    });
  }

  async handleJson(request) {
    return NodeResponse.json(this.buildReportResponse(request.query));
  }

  async handleTrafficJson(request) {
    const report = this.buildReportResponse(request.query);
    return NodeResponse.json({
      refresh: report.refresh,
      filters: report.filters,
      scope: report.scope,
      summary: report.summary,
      timeseries: report.traffic.timeseries,
      breakdowns: report.traffic.breakdowns
    });
  }

  async handleFunnelJson(request) {
    const report = this.buildReportResponse(request.query);
    return NodeResponse.json({
      refresh: report.refresh,
      filters: report.filters,
      scope: report.scope,
      funnels: report.funnels,
      summary: report.summary,
      funnel: report.funnel
    });
  }

  buildReportResponse(query) {
    const filters = normalizeFilters(query);
    const refresh = this.refreshScope(filters);
    const report = this.analyticsReportingService.buildReport({
      clientId: filters.clientId,
      websiteId: filters.websiteId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      model: filters.model,
      funnelKey: filters.funnelKey
    });

    return {
      ...report,
      refresh
    };
  }

  refreshScope(filters) {
    if (!filters.websiteId && !filters.clientId) {
      return {
        mode: "idle",
        queued: 0,
        refreshed: 0,
        website_ids: []
      };
    }

    if (this.analyticsRefreshService) {
      const queued = this.analyticsRefreshService.enqueueScopeRefresh({
        clientId: filters.clientId,
        websiteId: filters.websiteId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        reason: "report_view"
      });

      return {
        mode: "background",
        refreshed: 0,
        ...queued
      };
    }

    return {
      mode: "inline",
      queued: 0,
      refreshed: this.analyticsReportingService.refreshScope({
        clientId: filters.clientId,
        websiteId: filters.websiteId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo
      }),
      website_ids: []
    };
  }
}

function normalizeFilters(query) {
  return {
    clientId: positiveInteger(query.client_id),
    websiteId: positiveInteger(query.website_id),
    dateFrom: normalizeDate(query.date_from),
    dateTo: normalizeDate(query.date_to),
    funnelKey: normalizeToken(query.funnel_key),
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

function normalizeToken(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function renderHtml(report) {
  const hasScope = report.scope.type !== "none";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Attribution Reports</title>
  <style>
    :root{--bg:#f4efe5;--panel:rgba(255,250,242,.94);--panel-strong:rgba(255,255,255,.88);--ink:#17302a;--muted:#66766f;--accent:#0d6c5e;--line:rgba(23,48,42,.1);--shadow:0 24px 60px rgba(20,32,31,.09)}
    *{box-sizing:border-box} body{margin:0;color:var(--ink);font-family:"Aptos","Segoe UI",sans-serif;background:radial-gradient(circle at top left,rgba(13,108,94,.18),transparent 32rem),radial-gradient(circle at top right,rgba(183,142,65,.12),transparent 26rem),linear-gradient(180deg,#faf7f1 0%,var(--bg) 100%)}
    .shell{max-width:1520px;margin:0 auto;padding:1.4rem 1rem 3rem}
    ${renderAppShellStyles()}
    .hero,.panel,.card,.table-card,.section-banner,.notice{background:var(--panel);border:1px solid var(--line);border-radius:1.35rem;box-shadow:var(--shadow)}
    .hero,.panel,.section-banner,.notice{padding:1rem 1.05rem;margin-bottom:1rem}
    .hero-top,.panel-head,.stats,.summary-grid,.tables,.scope-meta{display:flex;gap:1rem;flex-wrap:wrap}
    .hero-top,.panel-head{justify-content:space-between;align-items:flex-end}
    h1,h2,h3{margin:0;font-family:"Aptos Display","Trebuchet MS",sans-serif}
    h1{font-size:clamp(2.1rem,4.8vw,3.2rem);letter-spacing:-.05em;line-height:.96}
    h2{font-size:1.2rem;letter-spacing:-.03em}
    h3{font-size:1rem;letter-spacing:-.02em}
    .lede,.meta,.empty{color:var(--muted);line-height:1.5}
    .stats{margin-top:.55rem}
    .stat,.card{padding:.95rem 1rem;border-radius:1.05rem;background:var(--panel-strong)}
    .stat strong,.metric{display:block;font-size:1.68rem;letter-spacing:-.05em}
    .pill{display:inline-flex;align-items:center;padding:.38rem .7rem;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.72);font-size:.84rem;color:var(--ink)}
    .scope-meta{margin-top:.55rem}
    .filters{display:grid;gap:.8rem;grid-template-columns:repeat(6,minmax(0,1fr));align-items:end}
    label{display:grid;gap:.35rem;font-size:.9rem;color:var(--muted)}
    input,select{width:100%;padding:.78rem .9rem;border:1px solid rgba(23,48,42,.14);border-radius:.95rem;background:rgba(255,255,255,.86);color:var(--ink);font:inherit}
    .button,.link-button{display:inline-flex;align-items:center;justify-content:center;min-height:2.8rem;padding:.78rem 1rem;border-radius:999px;border:1px solid var(--line);font:inherit;text-decoration:none;cursor:pointer;background:rgba(255,255,255,.72);color:var(--ink)}
    .button{background:var(--accent);border-color:transparent;color:#fff;box-shadow:0 12px 24px rgba(13,108,94,.18)}
    .summary-grid{display:grid;gap:1rem;grid-template-columns:repeat(4,minmax(0,1fr))}
    .metric-label{display:block;margin-top:.15rem;color:var(--muted)}
    .section-banner{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;background:linear-gradient(135deg,rgba(255,255,255,.82),rgba(255,247,235,.92))}
    .section-banner.attribution{background:linear-gradient(135deg,rgba(244,251,248,.92),rgba(255,255,255,.82))}
    .tables{align-items:stretch}
    .table-card{flex:1 1 22rem;padding:.9rem .95rem;border-radius:1rem;background:rgba(255,255,255,.76)}
    .table-wrap{overflow:auto}
    .notice{background:rgba(242,252,247,.96)}
    table{width:100%;border-collapse:collapse;font-size:.9rem}
    th,td{text-align:left;padding:.55rem .35rem;border-bottom:1px dashed rgba(23,48,42,.12);vertical-align:top}
    th{font-size:.76rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
    tr:last-child td{border-bottom:0}
    .empty{padding:2.8rem 1rem;text-align:center;border:1px dashed rgba(23,48,42,.16);border-radius:1.2rem;background:rgba(255,255,255,.55)}
    @media (max-width:1200px){.filters{grid-template-columns:repeat(3,minmax(0,1fr))}.summary-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
    @media (max-width:850px){.filters,.summary-grid{grid-template-columns:1fr 1fr}.tables{flex-direction:column}}
    @media (max-width:620px){.filters,.summary-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="shell">
    ${renderAppHeader("reports")}
    <section class="hero">
      <div class="hero-top">
        <div>
          <h1>Attribution Reports</h1>
          <p class="lede">Traffic reporting now comes from sessions and tracking events, while conversion attribution remains model-based. The attribution model filter only affects the conversion sections below.</p>
        </div>
      </div>
      <div class="scope-meta">
        <span class="pill">${hasScope ? escapeHtml(report.scope.label) : "No report scope selected"}</span>
        <span class="pill">${report.scope.website_count} website${report.scope.website_count === 1 ? "" : "s"}</span>
        <span class="pill">${report.filters.model.replaceAll("_", " ")}</span>
        <span class="pill">${escapeHtml(report.funnels.selected_label || "Default funnel")}</span>
      </div>
      <div class="stats">
        <div class="stat"><strong>${report.summary.sessions}</strong><span>Sessions</span></div>
        <div class="stat"><strong>${report.summary.pageviews}</strong><span>Pageviews</span></div>
        <div class="stat"><strong>${report.summary.engaged_sessions}</strong><span>Engaged sessions</span></div>
        <div class="stat"><strong>${formatPercent(report.summary.engagement_rate)}</strong><span>Engagement rate</span></div>
        <div class="stat"><strong>${report.summary.raw_conversions}</strong><span>Raw conversions</span></div>
        <div class="stat"><strong>${report.summary.attributed_conversions}</strong><span>Attributed conversions</span></div>
        <div class="stat"><strong>${formatCurrency(report.summary.attributed_conversion_value)}</strong><span>Attributed value</span></div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Filters</h2>
          <div class="meta">Choose a client or drill down to one website. Traffic sections use raw sessions and events. Attribution sections use the selected model.</div>
        </div>
        <div class="scope-meta">
          <a class="link-button" href="/admin/reports.json?${buildQueryString(report.filters)}">Report JSON</a>
          <a class="link-button" href="/admin/reports/traffic.json?${buildQueryString(report.filters)}">Traffic JSON</a>
          <a class="link-button" href="/admin/reports/funnel.json?${buildQueryString(report.filters)}">Funnel JSON</a>
        </div>
      </div>
      <form method="get" action="/admin/reports" class="filters">
        <label>Client<select name="client_id"><option value="">Select client</option>${report.clients.map((client) => `<option value="${client.id}"${report.filters.client_id === client.id ? " selected" : ""}>${escapeHtml(client.client_name)}</option>`).join("")}</select></label>
        <label>Website<select name="website_id"><option value="">All selected client websites</option>${report.websites.map((website) => `<option value="${website.id}"${report.filters.website_id === website.id ? " selected" : ""}>${escapeHtml(website.client_name)} - ${escapeHtml(website.website_name)}</option>`).join("")}</select></label>
        <label>Date From<input type="date" name="date_from" value="${escapeHtml(report.filters.date_from || "")}"></label>
        <label>Date To<input type="date" name="date_to" value="${escapeHtml(report.filters.date_to || "")}"></label>
        <label>Funnel<select name="funnel_key"><option value="">Default funnel</option>${report.funnels.available.map((funnel) => `<option value="${escapeHtml(funnel.key)}"${report.filters.funnel_key === funnel.key ? " selected" : ""}>${escapeHtml(funnel.label)}</option>`).join("")}</select></label>
        <label>Attribution Model<select name="model"><option value="first_touch"${report.filters.model === "first_touch" ? " selected" : ""}>First touch</option><option value="last_touch"${report.filters.model === "last_touch" ? " selected" : ""}>Last touch</option><option value="last_non_direct"${report.filters.model === "last_non_direct" ? " selected" : ""}>Last non-direct</option></select></label>
        <div><button class="button" type="submit">Refresh Report</button></div>
      </form>
    </section>
    ${renderRefreshNotice(report.refresh)}
    ${hasScope ? renderScopedSections(report) : `<div class="empty">Select a client or website to build traffic and attribution reports.</div>`}
  </main>
</body>
</html>`;
}

function renderScopedSections(report) {
  return `<section class="panel"><div class="summary-grid"><div class="card"><span class="metric">${report.summary.visitors}</span><span class="metric-label">True unique visitors</span></div><div class="card"><span class="metric">${report.summary.events}</span><span class="metric-label">Events</span></div><div class="card"><span class="metric">${report.summary.raw_conversions}</span><span class="metric-label">Raw conversions</span></div><div class="card"><span class="metric">${formatCurrency(report.summary.attributed_conversion_value)}</span><span class="metric-label">Attributed value</span></div></div></section>
    <section class="section-banner">
      <div>
        <h2>Traffic Reporting</h2>
        <div class="meta">These tables are session and event based, so they populate even before the first conversion happens.</div>
      </div>
      <span class="pill">Traffic-first</span>
    </section>
    <section class="tables">
      <div class="table-card"><h3>Daily Traffic Series</h3>${renderTimeseries(report.traffic.timeseries)}</div>
      <div class="table-card"><h3>Top Channels By Sessions</h3>${renderTrafficBreakdown(report.traffic.breakdowns.channels)}</div>
      <div class="table-card"><h3>Top Sources By Sessions</h3>${renderTrafficBreakdown(report.traffic.breakdowns.sources)}</div>
      <div class="table-card"><h3>Top Mediums By Sessions</h3>${renderTrafficBreakdown(report.traffic.breakdowns.mediums)}</div>
      <div class="table-card"><h3>Top Campaigns By Sessions</h3>${renderTrafficBreakdown(report.traffic.breakdowns.campaigns)}</div>
      <div class="table-card"><h3>Top Landing Pages By Sessions</h3>${renderTrafficBreakdown(report.traffic.breakdowns.landing_pages)}</div>
      <div class="table-card"><h3>Top Referrer Domains</h3>${renderTrafficBreakdown(report.traffic.breakdowns.referrer_domains)}</div>
      <div class="table-card"><h3>Top Devices</h3>${renderTrafficBreakdown(report.traffic.breakdowns.devices)}</div>
      <div class="table-card"><h3>Top Browsers</h3>${renderTrafficBreakdown(report.traffic.breakdowns.browsers)}</div>
      <div class="table-card"><h3>Event Counts By Type</h3>${renderEventTypeBreakdown(report.traffic.breakdowns.event_types)}</div>
    </section>
    <section class="section-banner">
      <div>
        <h2>Configured Funnel</h2>
        <div class="meta">Funnels are defined per website config and can combine session, engagement, page, event, and conversion steps.</div>
      </div>
      <span class="pill">${escapeHtml(report.funnel.label || "Default funnel")}</span>
    </section>
    <section class="panel">${renderFunnel(report.funnel)}</section>
    <section class="section-banner attribution">
      <div>
        <h2>Conversion Attribution</h2>
        <div class="meta">These sections stay empty until conversions exist. The selected attribution model applies here only.</div>
      </div>
      <span class="pill">${escapeHtml(report.filters.model.replaceAll("_", " "))}</span>
    </section>
    <section class="tables">
      <div class="table-card"><h3>Top Attributed Channels</h3>${renderAttributionBreakdown(report.attribution.breakdowns.channels)}</div>
      <div class="table-card"><h3>Top Attributed Sources</h3>${renderAttributionBreakdown(report.attribution.breakdowns.sources)}</div>
      <div class="table-card"><h3>Top Attributed Campaigns</h3>${renderAttributionBreakdown(report.attribution.breakdowns.campaigns)}</div>
    </section>
    <section class="panel"><h2>Recent Conversions</h2>${renderRecentConversions(report.attribution.recent_conversions)}</section>`;
}

function renderRefreshNotice(refresh) {
  if (!refresh || refresh.mode === "idle") {
    return "";
  }

  if (refresh.mode === "background") {
    return `<section class="notice"><strong>Background refresh queued.</strong> ${refresh.queued} website${refresh.queued === 1 ? "" : "s"} scheduled for rollup rebuild. The page below shows the latest completed rollups while the worker catches up.</section>`;
  }

  return `<section class="notice"><strong>Inline refresh completed.</strong> ${refresh.refreshed} website${refresh.refreshed === 1 ? "" : "s"} refreshed for this request.</section>`;
}

function renderTimeseries(rows) {
  if (!rows.length) {
    return `<div class="meta">No rollup data is available for this date range.</div>`;
  }

  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Visitors</th><th>Sessions</th><th>Engaged</th><th>Rate</th><th>Pageviews</th><th>Events</th><th>Raw Conversions</th><th>Attributed</th><th>Value</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.date)}</td><td>${row.visitors}</td><td>${row.sessions}</td><td>${row.engaged_sessions}</td><td>${formatPercent(row.engagement_rate)}</td><td>${row.pageviews}</td><td>${row.events}</td><td>${row.raw_conversions}</td><td>${row.attributed_conversions}</td><td>${formatCurrency(row.attributed_conversion_value)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderTrafficBreakdown(rows) {
  if (!rows.length) {
    return `<div class="meta">No traffic data is available for this date range.</div>`;
  }

  return `<div class="table-wrap"><table><thead><tr><th>Label</th><th>Sessions</th><th>Engaged</th><th>Rate</th><th>Pageviews</th><th>Events</th><th>Conversions</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.sessions}</td><td>${row.engaged_sessions}</td><td>${formatPercent(row.engagement_rate)}</td><td>${row.pageviews}</td><td>${row.events}</td><td>${row.conversions}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderEventTypeBreakdown(rows) {
  if (!rows.length) {
    return `<div class="meta">No event data is available for this date range.</div>`;
  }

  return `<div class="table-wrap"><table><thead><tr><th>Event Type</th><th>Events</th><th>Sessions</th><th>Conversions</th><th>Value</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.events}</td><td>${row.sessions}</td><td>${row.conversions}</td><td>${formatCurrency(row.conversion_value)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderFunnel(funnel) {
  if (!funnel?.steps?.length) {
    return `<div class="meta">No funnel data is available for this date range.</div>`;
  }

  return `<div class="table-wrap"><table><thead><tr><th>Step</th><th>Count</th><th>Rate From Sessions</th></tr></thead><tbody>${funnel.steps.map((step) => `<tr><td>${escapeHtml(step.label)}</td><td>${step.count}</td><td>${formatPercent(step.rate_from_sessions)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderAttributionBreakdown(rows) {
  if (!rows.length) {
    return `<div class="meta">No attributed conversion data is available.</div>`;
  }

  return `<div class="table-wrap"><table><thead><tr><th>Label</th><th>Conversions</th><th>Value</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.conversions}</td><td>${formatCurrency(row.conversion_value)}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderRecentConversions(rows) {
  if (!rows.length) {
    return `<div class="meta">No conversions matched the current filters.</div>`;
  }

  return `<div class="table-wrap"><table><thead><tr><th>Submitted</th><th>Website</th><th>Type</th><th>Campaign</th><th>Source</th><th>Channel</th><th>Value</th><th>Page</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(formatDate(row.submitted_at))}</td><td>${escapeHtml(`${row.client_name} - ${row.website_name}`)}</td><td>${escapeHtml(row.conversion_type)}</td><td>${escapeHtml(row.utm_campaign || "(none)")}</td><td>${escapeHtml(row.utm_source || "(direct)")}</td><td>${escapeHtml(row.channel || "(none)")}</td><td>${formatCurrency(row.value)}</td><td>${escapeHtml(row.page_url || "--")}</td></tr>`).join("")}</tbody></table></div>`;
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

function formatPercent(value) {
  const amount = Number(value ?? 0);
  return `${amount.toFixed(1)}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}
