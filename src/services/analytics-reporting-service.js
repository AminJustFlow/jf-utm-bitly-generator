import { normalizeTrackingConfig } from "../domain/tracking-config.js";
import { EngagedSessionService } from "./engaged-session-service.js";
import { TRAFFIC_DIMENSION_TYPES, TrafficDimensionService } from "./traffic-dimension-service.js";

const ATTRIBUTION_MODELS = ["first_touch", "last_touch", "last_non_direct"];

export class AnalyticsReportingService {
  constructor({
    database,
    clientRepository = null,
    websiteRepository,
    conversionAttributionRepository,
    analyticsRollupRepository,
    trafficDimensionService = new TrafficDimensionService(),
    engagedSessionService = new EngagedSessionService()
  }) {
    this.database = database;
    this.clientRepository = clientRepository;
    this.websiteRepository = websiteRepository;
    this.conversionAttributionRepository = conversionAttributionRepository;
    this.analyticsRollupRepository = analyticsRollupRepository;
    this.trafficDimensionService = trafficDimensionService;
    this.engagedSessionService = engagedSessionService;
  }

  refreshScope({
    clientId = null,
    websiteId = null,
    dateFrom = null,
    dateTo = null,
    fullRebuild = false
  } = {}) {
    const websites = this.resolveScopeWebsites({ clientId, websiteId });
    websites.forEach((website) => {
      this.refreshWebsite(website.id, fullRebuild
        ? { fullRebuild: true }
        : { dateFrom, dateTo });
    });
    return websites.length;
  }

  refreshWebsite(websiteId, options = {}) {
    const website = this.websiteRepository.findById(websiteId);
    if (!website) {
      const error = new Error("Website not found.");
      error.code = "website_not_found";
      throw error;
    }

    const fullRebuild = options.fullRebuild === true
      || (!options.dateFrom && !options.dateTo);
    const bounds = fullRebuild ? null : resolveDateBounds(options.dateFrom, options.dateTo);
    const sessions = this.loadSessions(websiteId);
    const events = this.loadEvents(websiteId);
    const conversions = this.loadConversions(websiteId);
    const sessionsByVisitor = buildSessionsByVisitor(sessions);
    const eventSummaryBySession = buildEventSummaryBySession(events);
    const sessionFacts = buildSessionFacts(sessions, eventSummaryBySession, this.trafficDimensionService, this.engagedSessionService);
    const scopedSessions = filterRowsByDate(sessions, "started_at", bounds);
    const scopedEvents = filterRowsByDate(events, "occurred_at", bounds);
    const scopedConversions = filterRowsByDate(conversions, "submitted_at", bounds);
    const now = new Date().toISOString();

    this.database.exec("BEGIN");
    try {
      if (bounds) {
        if (scopedConversions.length > 0) {
          this.conversionAttributionRepository.deleteByWebsiteAndConversionIds(websiteId, scopedConversions.map((conversion) => conversion.id));
        }
      } else {
        this.conversionAttributionRepository.deleteByWebsite(websiteId);
      }

      scopedConversions.forEach((conversion) => {
        const matches = buildAttributionMatches(conversion, sessionsByVisitor, sessions);
        ATTRIBUTION_MODELS.forEach((modelKey) => {
          const session = matches[modelKey];
          this.conversionAttributionRepository.upsert({
            websiteId,
            conversionId: conversion.id,
            conversionUuid: conversion.conversion_uuid,
            modelKey,
            attributedSessionId: session?.id ?? null,
            attributedVisitorId: session?.visitor_id ?? conversion.visitor_id,
            sourceCategory: session?.source_category ?? "",
            channel: session?.channel ?? "",
            referrerDomain: session?.referrer_domain ?? "",
            utmSource: session?.utm_source ?? "",
            utmMedium: session?.utm_medium ?? "",
            utmCampaign: session?.utm_campaign ?? "",
            utmTerm: session?.utm_term ?? "",
            utmContent: session?.utm_content ?? "",
            isDirect: truthy(session?.is_direct),
            createdAt: conversion.submitted_at,
            updatedAt: now
          });
        });
      });

      this.analyticsRollupRepository.replaceTrafficRollups(
        websiteId,
        buildTrafficRollupRows(scopedSessions, scopedEvents, scopedConversions, sessionFacts),
        { timestamp: now, bounds }
      );
      this.analyticsRollupRepository.replaceDimensionRollups(
        websiteId,
        buildDimensionRollupRows(
          scopedSessions,
          scopedEvents,
          scopedConversions,
          sessionFacts,
          this.trafficDimensionService
        ),
        { timestamp: now, bounds }
      );
      this.analyticsRollupRepository.replaceConversionRollups(
        websiteId,
        this.buildConversionRollups(websiteId, bounds),
        { timestamp: now, bounds }
      );
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  buildReport({
    clientId = null,
    websiteId = null,
    dateFrom,
    dateTo,
    model = "last_touch",
    funnelKey = null
  }) {
    const normalizedModel = ATTRIBUTION_MODELS.includes(model) ? model : "last_touch";
    const bounds = resolveDateBounds(dateFrom, dateTo);
    const allClients = this.listClients();
    const websiteRows = this.websiteRepository.list();
    const allWebsites = websiteRows.map((website) => ({
      id: Number(website.id),
      client_id: website.client_id === null || website.client_id === undefined ? null : Number(website.client_id),
      client_name: website.client_name,
      website_name: website.website_name,
      status: website.status
    }));
    const selectedWebsite = positiveInteger(websiteId)
      ? allWebsites.find((website) => website.id === Number(websiteId)) ?? null
      : null;
    const effectiveClientId = selectedWebsite
      ? selectedWebsite.client_id
      : positiveInteger(clientId);
    const websiteOptions = effectiveClientId
      ? allWebsites.filter((website) => website.client_id === effectiveClientId)
      : allWebsites;
    const websiteIds = selectedWebsite
      ? [selectedWebsite.id]
      : effectiveClientId
        ? websiteOptions.map((website) => website.id)
        : [];
    const selectedClient = effectiveClientId
      ? allClients.find((client) => client.id === effectiveClientId) ?? null
      : null;
    const selectedWebsiteRow = selectedWebsite
      ? websiteRows.find((website) => Number(website.id) === selectedWebsite.id) ?? null
      : null;
    const scopedWebsiteRows = effectiveClientId
      ? websiteRows.filter((website) => Number(website.client_id ?? 0) === effectiveClientId)
      : [];
    const availableFunnels = buildAvailableFunnels(selectedWebsiteRow, scopedWebsiteRows);
    const selectedFunnel = selectFunnelDefinition(availableFunnels, funnelKey);
    const filters = {
      client_id: effectiveClientId ?? null,
      website_id: selectedWebsite?.id ?? null,
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo,
      model: normalizedModel,
      funnel_key: selectedFunnel?.key ?? null
    };

    if (websiteIds.length === 0) {
      return buildEmptyReport({
        clients: allClients,
        websites: websiteOptions,
        filters,
        funnels: {
          available: availableFunnels.map((funnelDefinition) => ({
            key: funnelDefinition.key,
            label: funnelDefinition.label
          })),
          selected_key: selectedFunnel?.key ?? null,
          selected_label: selectedFunnel?.label ?? ""
        }
      });
    }

    const summary = this.summary(websiteIds, bounds, normalizedModel);
    const traffic = {
      timeseries: this.timeseries(websiteIds, bounds, normalizedModel),
      breakdowns: {
        channels: this.trafficBreakdown(websiteIds, bounds, TRAFFIC_DIMENSION_TYPES.channel),
        sources: this.trafficBreakdown(websiteIds, bounds, TRAFFIC_DIMENSION_TYPES.source),
        mediums: this.trafficBreakdown(websiteIds, bounds, TRAFFIC_DIMENSION_TYPES.medium),
        campaigns: this.trafficBreakdown(websiteIds, bounds, TRAFFIC_DIMENSION_TYPES.campaign),
        landing_pages: this.trafficBreakdown(websiteIds, bounds, TRAFFIC_DIMENSION_TYPES.landingPage),
        referrer_domains: this.trafficBreakdown(websiteIds, bounds, TRAFFIC_DIMENSION_TYPES.referrerDomain),
        devices: this.trafficBreakdown(websiteIds, bounds, TRAFFIC_DIMENSION_TYPES.deviceType),
        browsers: this.trafficBreakdown(websiteIds, bounds, TRAFFIC_DIMENSION_TYPES.browser),
        event_types: this.trafficBreakdown(websiteIds, bounds, TRAFFIC_DIMENSION_TYPES.eventType, 12)
      }
    };
    const attribution = {
      breakdowns: {
        channels: this.attributionBreakdown(websiteIds, bounds, normalizedModel, "channel"),
        sources: this.attributionBreakdown(websiteIds, bounds, normalizedModel, "utm_source"),
        campaigns: this.attributionBreakdown(websiteIds, bounds, normalizedModel, "utm_campaign")
      },
      recent_conversions: this.recentConversions(websiteIds, bounds, normalizedModel)
    };
    const funnel = this.funnel(websiteIds, bounds, selectedFunnel);

    return {
      clients: allClients,
      websites: websiteOptions,
      filters,
      scope: buildScope(selectedClient, selectedWebsite, websiteIds.length),
      funnels: {
        available: availableFunnels.map((funnelDefinition) => ({
          key: funnelDefinition.key,
          label: funnelDefinition.label
        })),
        selected_key: selectedFunnel?.key ?? null,
        selected_label: selectedFunnel?.label ?? ""
      },
      summary,
      traffic,
      funnel,
      attribution,
      timeseries: traffic.timeseries,
      breakdowns: attribution.breakdowns,
      recent_conversions: attribution.recent_conversions
    };
  }

  summary(websiteIds, bounds, model) {
    const websiteList = buildWebsiteList(websiteIds);
    const traffic = this.database.prepare(`
      SELECT
        COALESCE(SUM(visitors), 0) AS visitors,
        COALESCE(SUM(sessions), 0) AS sessions,
        COALESCE(SUM(pageviews), 0) AS pageviews,
        COALESCE(SUM(events), 0) AS events,
        COALESCE(SUM(engaged_sessions), 0) AS engaged_sessions,
        COALESCE(SUM(conversions), 0) AS raw_conversions
      FROM analytics_daily_traffic_rollups
      WHERE website_id IN (${websiteList})
        AND rollup_date BETWEEN :date_from AND :date_to
    `).get({
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo
    });
    const attributed = this.database.prepare(`
      SELECT
        COALESCE(SUM(conversions), 0) AS conversions,
        COALESCE(SUM(conversion_value), 0) AS conversion_value
      FROM analytics_daily_conversion_rollups
      WHERE website_id IN (${websiteList})
        AND attribution_model = :attribution_model
        AND rollup_date BETWEEN :date_from AND :date_to
    `).get({
      attribution_model: model,
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo
    });

    const engagedSessions = Number(traffic.engaged_sessions ?? 0);
    const sessions = Number(traffic.sessions ?? 0);

    return {
      visitors: this.trueUniqueVisitors(websiteIds, bounds),
      sessions,
      pageviews: Number(traffic.pageviews ?? 0),
      events: Number(traffic.events ?? 0),
      engaged_sessions: engagedSessions,
      engagement_rate: this.engagedSessionService.engagementRate(engagedSessions, sessions),
      raw_conversions: Number(traffic.raw_conversions ?? 0),
      attributed_conversions: Number(attributed.conversions ?? 0),
      attributed_conversion_value: Number(attributed.conversion_value ?? 0)
    };
  }

  trueUniqueVisitors(websiteIds, bounds) {
    const websiteList = buildWebsiteList(websiteIds);
    const row = this.database.prepare(`
      SELECT COUNT(DISTINCT CASE
        WHEN v.stitched_profile_id IS NOT NULL THEN 'profile:' || v.stitched_profile_id
        ELSE 'visitor:' || s.website_id || ':' || v.id
      END) AS visitors
      FROM sessions s
      INNER JOIN visitors v ON v.id = s.visitor_id
      WHERE s.website_id IN (${websiteList})
        AND substr(s.started_at, 1, 10) BETWEEN :date_from AND :date_to
    `).get({
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo
    });

    return Number(row?.visitors ?? 0);
  }

  timeseries(websiteIds, bounds, model) {
    const websiteList = buildWebsiteList(websiteIds);

    return this.database.prepare(`
      SELECT
        traffic.rollup_date,
        SUM(traffic.visitors) AS visitors,
        SUM(traffic.sessions) AS sessions,
        SUM(traffic.pageviews) AS pageviews,
        SUM(traffic.events) AS events,
        SUM(traffic.engaged_sessions) AS engaged_sessions,
        SUM(traffic.conversions) AS raw_conversions,
        COALESCE(conversions.conversions, 0) AS attributed_conversions,
        COALESCE(conversions.conversion_value, 0) AS attributed_conversion_value
      FROM analytics_daily_traffic_rollups traffic
      LEFT JOIN (
        SELECT
          rollup_date,
          SUM(conversions) AS conversions,
          SUM(conversion_value) AS conversion_value
        FROM analytics_daily_conversion_rollups
        WHERE website_id IN (${websiteList})
          AND attribution_model = :attribution_model
          AND rollup_date BETWEEN :date_from AND :date_to
        GROUP BY rollup_date
      ) conversions ON conversions.rollup_date = traffic.rollup_date
      WHERE traffic.website_id IN (${websiteList})
        AND traffic.rollup_date BETWEEN :date_from AND :date_to
      GROUP BY traffic.rollup_date
      ORDER BY traffic.rollup_date ASC
    `).all({
      attribution_model: model,
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo
    }).map((row) => ({
      date: row.rollup_date,
      visitors: Number(row.visitors ?? 0),
      sessions: Number(row.sessions ?? 0),
      pageviews: Number(row.pageviews ?? 0),
      events: Number(row.events ?? 0),
      engaged_sessions: Number(row.engaged_sessions ?? 0),
      engagement_rate: this.engagedSessionService.engagementRate(row.engaged_sessions, row.sessions),
      raw_conversions: Number(row.raw_conversions ?? 0),
      attributed_conversions: Number(row.attributed_conversions ?? 0),
      attributed_conversion_value: Number(row.attributed_conversion_value ?? 0)
    }));
  }

  trafficBreakdown(websiteIds, bounds, dimensionType, limit = 10) {
    const websiteList = buildWebsiteList(websiteIds);
    const orderColumn = dimensionType === TRAFFIC_DIMENSION_TYPES.eventType ? "events" : "sessions";

    return this.database.prepare(`
      SELECT
        dimension_key,
        SUM(sessions) AS sessions,
        SUM(engaged_sessions) AS engaged_sessions,
        SUM(pageviews) AS pageviews,
        SUM(events) AS events,
        SUM(conversions) AS conversions,
        SUM(conversion_value) AS conversion_value
      FROM analytics_daily_dimension_rollups
      WHERE website_id IN (${websiteList})
        AND report_date BETWEEN :date_from AND :date_to
        AND dimension_type = :dimension_type
      GROUP BY dimension_key
      HAVING SUM(sessions) > 0
         OR SUM(events) > 0
         OR SUM(conversions) > 0
      ORDER BY ${orderColumn} DESC, events DESC, conversions DESC, dimension_key ASC
      LIMIT ${Number(limit)}
    `).all({
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo,
      dimension_type: dimensionType
    }).map((row) => {
      const sessions = Number(row.sessions ?? 0);
      const engagedSessions = Number(row.engaged_sessions ?? 0);

      return {
        label: row.dimension_key || "(none)",
        sessions,
        engaged_sessions: engagedSessions,
        engagement_rate: this.engagedSessionService.engagementRate(engagedSessions, sessions),
        pageviews: Number(row.pageviews ?? 0),
        events: Number(row.events ?? 0),
        conversions: Number(row.conversions ?? 0),
        conversion_value: Number(row.conversion_value ?? 0)
      };
    });
  }

  attributionBreakdown(websiteIds, bounds, model, field) {
    const websiteList = buildWebsiteList(websiteIds);

    return this.database.prepare(`
      SELECT
        ${field} AS label,
        SUM(conversions) AS conversions,
        SUM(conversion_value) AS conversion_value
      FROM analytics_daily_conversion_rollups
      WHERE website_id IN (${websiteList})
        AND attribution_model = :attribution_model
        AND rollup_date BETWEEN :date_from AND :date_to
      GROUP BY ${field}
      HAVING SUM(conversions) > 0
      ORDER BY conversions DESC, conversion_value DESC, label ASC
      LIMIT 10
    `).all({
      attribution_model: model,
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo
    }).map((row) => ({
      label: row.label || "(direct / none)",
      conversions: Number(row.conversions ?? 0),
      conversion_value: Number(row.conversion_value ?? 0)
    }));
  }

  recentConversions(websiteIds, bounds, model) {
    const websiteList = buildWebsiteList(websiteIds);

    return this.database.prepare(`
      SELECT
        c.conversion_uuid,
        c.conversion_type,
        c.page_url,
        c.value,
        c.submitted_at,
        w.client_name,
        w.website_name,
        ca.channel,
        ca.source_category,
        ca.utm_source,
        ca.utm_medium,
        ca.utm_campaign
      FROM conversions c
      INNER JOIN websites w ON w.id = c.website_id
      LEFT JOIN conversion_attributions ca
        ON ca.conversion_id = c.id
       AND ca.model_key = :attribution_model
      WHERE c.website_id IN (${websiteList})
        AND substr(c.submitted_at, 1, 10) BETWEEN :date_from AND :date_to
      ORDER BY c.submitted_at DESC, c.id DESC
      LIMIT 12
    `).all({
      attribution_model: model,
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo
    }).map((row) => ({
      conversion_uuid: row.conversion_uuid,
      conversion_type: row.conversion_type,
      client_name: row.client_name,
      website_name: row.website_name,
      page_url: row.page_url,
      value: Number(row.value ?? 0),
      submitted_at: row.submitted_at,
      channel: row.channel || "",
      source_category: row.source_category || "",
      utm_source: row.utm_source || "",
      utm_medium: row.utm_medium || "",
      utm_campaign: row.utm_campaign || ""
    }));
  }

  funnel(websiteIds, bounds, definition) {
    const websiteList = buildWebsiteList(websiteIds);
    const selectedDefinition = definition ?? {
      key: "lead_journey",
      label: "Lead Journey",
      steps: []
    };
    const sessionBase = this.countScopedSessions(websiteList, bounds);
    const steps = selectedDefinition.steps.map((step) => {
      const count = this.countFunnelStep(websiteList, bounds, step);
      return createFunnelStep(step.key, step.label, count, sessionBase);
    });

    return {
      key: selectedDefinition.key,
      label: selectedDefinition.label,
      steps,
      totals: {
        sessions: sessionBase,
        raw_conversions: this.countScopedConversions(websiteList, bounds)
      }
    };
  }

  countScopedSessions(websiteList, bounds) {
    const row = this.database.prepare(`
      SELECT COUNT(DISTINCT s.id) AS count
      FROM sessions s
      WHERE s.website_id IN (${websiteList})
        AND substr(s.started_at, 1, 10) BETWEEN :date_from AND :date_to
    `).get({
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo
    });

    return Number(row?.count ?? 0);
  }

  countScopedConversions(websiteList, bounds) {
    const row = this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM conversions c
      WHERE c.website_id IN (${websiteList})
        AND substr(c.submitted_at, 1, 10) BETWEEN :date_from AND :date_to
    `).get({
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo
    });

    return Number(row?.count ?? 0);
  }

  countFunnelStep(websiteList, bounds, step) {
    if (step.type === "session") {
      return this.countScopedSessions(websiteList, bounds);
    }

    if (step.type === "engaged_session") {
      const row = this.database.prepare(`
        SELECT COUNT(DISTINCT s.id) AS count
        FROM sessions s
        WHERE s.website_id IN (${websiteList})
          AND substr(s.started_at, 1, 10) BETWEEN :date_from AND :date_to
          AND (
            s.is_engaged = 1
            OR s.pageviews >= 2
            OR s.engagement_seconds >= 30
            OR EXISTS (
              SELECT 1
              FROM tracking_events te
              WHERE te.session_id = s.id
                AND te.event_type <> 'page_view'
            )
          )
      `).get({
        date_from: bounds.dateFrom,
        date_to: bounds.dateTo
      });

      return Number(row?.count ?? 0);
    }

    if (step.type === "page" || step.type === "event") {
      const eventFilters = buildFunnelEventConditions(step);
      const row = this.database.prepare(`
        SELECT COUNT(DISTINCT te.session_id) AS count
        FROM tracking_events te
        WHERE te.website_id IN (${websiteList})
          AND substr(te.occurred_at, 1, 10) BETWEEN :date_from AND :date_to
          ${eventFilters.sql}
      `).get({
        date_from: bounds.dateFrom,
        date_to: bounds.dateTo,
        ...eventFilters.params
      });

      return Number(row?.count ?? 0);
    }

    if (step.type === "conversion") {
      const conversionFilters = buildFunnelConversionConditions(step);
      const row = this.database.prepare(`
        SELECT COUNT(DISTINCT c.session_id) AS count
        FROM conversions c
        WHERE c.website_id IN (${websiteList})
          AND substr(c.submitted_at, 1, 10) BETWEEN :date_from AND :date_to
          ${conversionFilters.sql}
      `).get({
        date_from: bounds.dateFrom,
        date_to: bounds.dateTo,
        ...conversionFilters.params
      });

      return Number(row?.count ?? 0);
    }

    return 0;
  }

  buildConversionRollups(websiteId, bounds = null) {
    const dateFilter = bounds
      ? "AND substr(c.submitted_at, 1, 10) BETWEEN :date_from AND :date_to"
      : "";
    const params = {
      website_id: websiteId
    };

    if (bounds) {
      params.date_from = bounds.dateFrom;
      params.date_to = bounds.dateTo;
    }

    return this.database.prepare(`
      SELECT
        substr(c.submitted_at, 1, 10) AS rollup_date,
        ca.model_key AS attribution_model,
        c.conversion_type,
        ca.source_category,
        ca.channel,
        ca.referrer_domain,
        ca.utm_source,
        ca.utm_medium,
        ca.utm_campaign,
        COUNT(*) AS conversions,
        COALESCE(SUM(c.value), 0) AS conversion_value
      FROM conversions c
      INNER JOIN conversion_attributions ca ON ca.conversion_id = c.id
      WHERE c.website_id = :website_id
        ${dateFilter}
      GROUP BY
        substr(c.submitted_at, 1, 10),
        ca.model_key,
        c.conversion_type,
        ca.source_category,
        ca.channel,
        ca.referrer_domain,
        ca.utm_source,
        ca.utm_medium,
        ca.utm_campaign
      ORDER BY rollup_date ASC
    `).all(params).map((row) => ({
      rollupDate: row.rollup_date,
      attributionModel: row.attribution_model,
      conversionType: row.conversion_type,
      sourceCategory: row.source_category,
      channel: row.channel,
      referrerDomain: row.referrer_domain,
      utmSource: row.utm_source,
      utmMedium: row.utm_medium,
      utmCampaign: row.utm_campaign,
      conversions: Number(row.conversions ?? 0),
      conversionValue: Number(row.conversion_value ?? 0)
    }));
  }

  loadSessions(websiteId) {
    return this.database.prepare(`
      SELECT *
      FROM sessions
      WHERE website_id = :website_id
      ORDER BY started_at ASC, id ASC
    `).all({
      website_id: websiteId
    });
  }

  loadEvents(websiteId) {
    return this.database.prepare(`
      SELECT *
      FROM tracking_events
      WHERE website_id = :website_id
      ORDER BY occurred_at ASC, id ASC
    `).all({
      website_id: websiteId
    }).map((row) => ({
      ...row,
      meta: parseObject(row.meta_json)
    }));
  }

  loadConversions(websiteId) {
    return this.database.prepare(`
      SELECT *
      FROM conversions
      WHERE website_id = :website_id
      ORDER BY submitted_at ASC, id ASC
    `).all({
      website_id: websiteId
    });
  }

  resolveScopeWebsites({ clientId = null, websiteId = null }) {
    const websites = this.websiteRepository.list().map((website) => ({
      id: Number(website.id),
      client_id: website.client_id === null || website.client_id === undefined ? null : Number(website.client_id)
    }));

    if (positiveInteger(websiteId)) {
      return websites.filter((website) => website.id === Number(websiteId));
    }

    if (positiveInteger(clientId)) {
      return websites.filter((website) => website.client_id === Number(clientId));
    }

    return [];
  }

  listClients() {
    if (this.clientRepository) {
      return this.clientRepository.list().map((client) => ({
        id: Number(client.id),
        client_name: client.client_name,
        status: client.status
      }));
    }

    const seen = new Map();
    this.websiteRepository.list().forEach((website) => {
      const clientName = String(website.client_name ?? "").trim();
      if (!clientName || seen.has(clientName.toLowerCase())) {
        return;
      }
      seen.set(clientName.toLowerCase(), {
        id: null,
        client_name: clientName,
        status: "active"
      });
    });
    return [...seen.values()];
  }
}

function buildTrafficRollupRows(sessions, events, conversions, sessionFacts) {
  const rowsByDate = new Map();
  const visitorsByDate = new Map();

  events.forEach((event) => {
    const date = datePart(event.occurred_at);
    if (!date) {
      return;
    }

    const row = getOrCreateTrafficRow(rowsByDate, date);
    row.events += 1;
    if (event.event_type === "page_view") {
      row.pageviews += 1;
    }

    const visitors = visitorsByDate.get(date) ?? new Set();
    visitors.add(String(event.visitor_id));
    visitorsByDate.set(date, visitors);
  });

  sessions.forEach((session) => {
    const date = datePart(session.started_at);
    if (!date) {
      return;
    }

    const row = getOrCreateTrafficRow(rowsByDate, date);
    row.sessions += 1;
    if (sessionFacts.get(Number(session.id))?.engaged) {
      row.engagedSessions += 1;
    }
  });

  conversions.forEach((conversion) => {
    const date = datePart(conversion.submitted_at);
    if (!date) {
      return;
    }

    const row = getOrCreateTrafficRow(rowsByDate, date);
    row.conversions += 1;
  });

  visitorsByDate.forEach((visitorSet, date) => {
    const row = getOrCreateTrafficRow(rowsByDate, date);
    row.visitors = visitorSet.size;
  });

  return [...rowsByDate.values()].sort((left, right) => left.rollupDate.localeCompare(right.rollupDate));
}

function buildDimensionRollupRows(sessions, events, conversions, sessionFacts, trafficDimensionService) {
  const rows = new Map();

  sessions.forEach((session) => {
    const date = datePart(session.started_at);
    const facts = sessionFacts.get(Number(session.id));
    if (!date || !facts) {
      return;
    }

    accumulateSessionDimensions(rows, date, facts, {
      sessions: 1,
      engagedSessions: facts.engaged ? 1 : 0
    });
  });

  events.forEach((event) => {
    const date = datePart(event.occurred_at);
    const facts = sessionFacts.get(Number(event.session_id));
    if (!date || !facts) {
      return;
    }

    accumulateSessionDimensions(rows, date, facts, {
      events: 1,
      pageviews: event.event_type === "page_view" ? 1 : 0
    });
    const eventTypeRow = getOrCreateDimensionRow(rows, date, TRAFFIC_DIMENSION_TYPES.eventType, trafficDimensionService.resolveEventType(event.event_type));
    eventTypeRow.events += 1;
    if (event.event_type === "page_view") {
      eventTypeRow.pageviews += 1;
    }
    eventTypeRow.sessionIds.add(Number(event.session_id));
    if (facts.engaged) {
      eventTypeRow.engagedSessionIds.add(Number(event.session_id));
    }
  });

  conversions.forEach((conversion) => {
    const date = datePart(conversion.submitted_at);
    const facts = sessionFacts.get(Number(conversion.session_id));
    if (!date || !facts) {
      return;
    }

    accumulateSessionDimensions(rows, date, facts, {
      conversions: 1,
      conversionValue: Number(conversion.value ?? 0)
    });
    const eventTypeRow = getOrCreateDimensionRow(rows, date, TRAFFIC_DIMENSION_TYPES.eventType, trafficDimensionService.resolveEventType(conversion.conversion_type));
    eventTypeRow.conversions += 1;
    eventTypeRow.conversionValue += Number(conversion.value ?? 0);
  });

  return [...rows.values()]
    .map((row) => ({
      reportDate: row.reportDate,
      dimensionType: row.dimensionType,
      dimensionKey: row.dimensionKey,
      sessions: row.dimensionType === TRAFFIC_DIMENSION_TYPES.eventType ? row.sessionIds.size : row.sessions,
      engagedSessions: row.dimensionType === TRAFFIC_DIMENSION_TYPES.eventType ? row.engagedSessionIds.size : row.engagedSessions,
      pageviews: row.pageviews,
      events: row.events,
      conversions: row.conversions,
      conversionValue: row.conversionValue
    }))
    .sort((left, right) => {
      if (left.reportDate !== right.reportDate) {
        return left.reportDate.localeCompare(right.reportDate);
      }
      if (left.dimensionType !== right.dimensionType) {
        return left.dimensionType.localeCompare(right.dimensionType);
      }
      return left.dimensionKey.localeCompare(right.dimensionKey);
    });
}

function accumulateSessionDimensions(rows, reportDate, facts, metrics) {
  const dimensionPairs = [
    [TRAFFIC_DIMENSION_TYPES.overall, ""],
    [TRAFFIC_DIMENSION_TYPES.channel, facts.dimensions.channel],
    [TRAFFIC_DIMENSION_TYPES.source, facts.dimensions.source],
    [TRAFFIC_DIMENSION_TYPES.medium, facts.dimensions.medium],
    [TRAFFIC_DIMENSION_TYPES.campaign, facts.dimensions.campaign],
    [TRAFFIC_DIMENSION_TYPES.landingPage, facts.dimensions.landingPage],
    [TRAFFIC_DIMENSION_TYPES.referrerDomain, facts.dimensions.referrerDomain],
    [TRAFFIC_DIMENSION_TYPES.deviceType, facts.dimensions.deviceType],
    [TRAFFIC_DIMENSION_TYPES.browser, facts.dimensions.browser]
  ];

  dimensionPairs.forEach(([dimensionType, dimensionKey]) => {
    const row = getOrCreateDimensionRow(rows, reportDate, dimensionType, dimensionKey);
    row.sessions += metrics.sessions ?? 0;
    row.engagedSessions += metrics.engagedSessions ?? 0;
    row.pageviews += metrics.pageviews ?? 0;
    row.events += metrics.events ?? 0;
    row.conversions += metrics.conversions ?? 0;
    row.conversionValue += metrics.conversionValue ?? 0;
  });
}

function buildSessionFacts(sessions, eventSummaryBySession, trafficDimensionService, engagedSessionService) {
  const facts = new Map();

  sessions.forEach((session) => {
    const eventSummary = eventSummaryBySession.get(Number(session.id)) ?? {
      hasNonPageViewEvent: false,
      deviceType: null,
      browser: null
    };
    facts.set(Number(session.id), {
      dimensions: trafficDimensionService.resolveSessionDimensions(session, eventSummary),
      engaged: engagedSessionService.isEngaged(session, eventSummary)
    });
  });

  return facts;
}

function buildSessionsByVisitor(sessions) {
  const grouped = new Map();
  sessions.forEach((session) => {
    const key = String(session.visitor_id);
    const bucket = grouped.get(key) ?? [];
    bucket.push(session);
    grouped.set(key, bucket);
  });
  return grouped;
}

function buildAttributionMatches(conversion, sessionsByVisitor, allSessions) {
  const visitorKey = String(conversion.visitor_id);
  const visitorSessions = (sessionsByVisitor.get(visitorKey) ?? [])
    .filter((session) => {
      const startedAt = Date.parse(String(session.started_at ?? ""));
      const submittedAt = Date.parse(String(conversion.submitted_at ?? ""));
      return !Number.isNaN(startedAt) && !Number.isNaN(submittedAt) && startedAt <= submittedAt;
    });
  const currentSession = allSessions.find((session) => Number(session.id) === Number(conversion.session_id)) ?? null;
  const firstTouch = visitorSessions[0] ?? currentSession;
  const lastTouch = visitorSessions[visitorSessions.length - 1] ?? currentSession;
  const lastNonDirect = [...visitorSessions].reverse().find((session) => !truthy(session.is_direct)) ?? lastTouch;

  return {
    first_touch: firstTouch,
    last_touch: lastTouch,
    last_non_direct: lastNonDirect
  };
}

function buildEventSummaryBySession(events) {
  const summaries = new Map();

  events.forEach((event) => {
    const sessionId = Number(event.session_id);
    const summary = summaries.get(sessionId) ?? {
      hasNonPageViewEvent: false,
      deviceType: null,
      browser: null
    };

    if (event.event_type !== "page_view") {
      summary.hasNonPageViewEvent = true;
    }

    if (!summary.deviceType) {
      summary.deviceType = metaString(event.meta, ["device_type", "device"]);
    }
    if (!summary.browser) {
      summary.browser = metaString(event.meta, ["browser_name", "browser"]);
    }

    summaries.set(sessionId, summary);
  });

  return summaries;
}

function buildScope(selectedClient, selectedWebsite, websiteCount) {
  if (selectedWebsite) {
    return {
      type: "website",
      label: `${selectedWebsite.client_name} - ${selectedWebsite.website_name}`,
      website_count: websiteCount
    };
  }

  if (selectedClient) {
    return {
      type: "client",
      label: selectedClient.client_name,
      website_count: websiteCount
    };
  }

  return {
    type: "none",
    label: "",
    website_count: 0
  };
}

function buildEmptyReport({ clients, websites, filters, funnels }) {
  const selectedLabel = funnels?.selected_label ?? "";
  const selectedKey = funnels?.selected_key ?? null;
  return {
    clients,
    websites,
    filters,
    funnels,
    scope: {
      type: "none",
      label: "",
      website_count: 0
    },
    summary: emptySummary(),
    traffic: {
      timeseries: [],
      breakdowns: {
        channels: [],
        sources: [],
        mediums: [],
        campaigns: [],
        landing_pages: [],
        referrer_domains: [],
        devices: [],
        browsers: [],
        event_types: []
      }
    },
    funnel: {
      key: selectedKey,
      label: selectedLabel,
      steps: [],
      totals: {
        sessions: 0,
        raw_conversions: 0
      }
    },
    attribution: {
      breakdowns: {
        channels: [],
        sources: [],
        campaigns: []
      },
      recent_conversions: []
    },
    timeseries: [],
    breakdowns: {
      channels: [],
      sources: [],
      campaigns: []
    },
    recent_conversions: []
  };
}

function resolveDateBounds(dateFrom, dateTo) {
  const today = new Date().toISOString().slice(0, 10);
  const from = normalizeDateOnly(dateFrom) ?? today;
  const to = normalizeDateOnly(dateTo) ?? today;

  if (from <= to) {
    return {
      dateFrom: from,
      dateTo: to
    };
  }

  return {
    dateFrom: to,
    dateTo: from
  };
}

function filterRowsByDate(rows, field, bounds) {
  if (!bounds) {
    return rows;
  }

  return rows.filter((row) => {
    const date = datePart(row[field]);
    return date && date >= bounds.dateFrom && date <= bounds.dateTo;
  });
}

function datePart(value) {
  const normalized = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}/u.test(normalized) ? normalized.slice(0, 10) : null;
}

function normalizeDateOnly(value) {
  const normalized = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/u.test(normalized) ? normalized : null;
}

function buildWebsiteList(websiteIds) {
  const normalized = websiteIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (normalized.length === 0) {
    return "0";
  }

  return normalized.join(", ");
}

function getOrCreateTrafficRow(rowsByDate, rollupDate) {
  const row = rowsByDate.get(rollupDate) ?? createEmptyTrafficRow(rollupDate);
  rowsByDate.set(rollupDate, row);
  return row;
}

function getOrCreateDimensionRow(rows, reportDate, dimensionType, dimensionKey) {
  const key = `${reportDate}:${dimensionType}:${dimensionKey}`;
  const row = rows.get(key) ?? {
    reportDate,
    dimensionType,
    dimensionKey,
    sessions: 0,
    engagedSessions: 0,
    pageviews: 0,
    events: 0,
    conversions: 0,
    conversionValue: 0,
    sessionIds: new Set(),
    engagedSessionIds: new Set()
  };
  rows.set(key, row);
  return row;
}

function createEmptyTrafficRow(rollupDate) {
  return {
    rollupDate,
    visitors: 0,
    sessions: 0,
    pageviews: 0,
    events: 0,
    engagedSessions: 0,
    conversions: 0
  };
}

function truthy(value) {
  return value === true || value === 1 || value === "1";
}

function positiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function emptySummary() {
  return {
    visitors: 0,
    sessions: 0,
    pageviews: 0,
    events: 0,
    engaged_sessions: 0,
    engagement_rate: 0,
    raw_conversions: 0,
    attributed_conversions: 0,
    attributed_conversion_value: 0
  };
}

function buildAvailableFunnels(selectedWebsite, scopedWebsites) {
  const sourceWebsites = selectedWebsite
    ? [selectedWebsite]
    : scopedWebsites;
  const funnelsByKey = new Map();

  sourceWebsites.forEach((website) => {
    const config = normalizeTrackingConfig(website?.config_json);
    config.reporting_funnels.forEach((funnel) => {
      if (!funnelsByKey.has(funnel.key)) {
        funnelsByKey.set(funnel.key, funnel);
      }
    });
  });

  if (funnelsByKey.size === 0) {
    const fallbackConfig = normalizeTrackingConfig({});
    fallbackConfig.reporting_funnels.forEach((funnel) => {
      funnelsByKey.set(funnel.key, funnel);
    });
  }

  return [...funnelsByKey.values()];
}

function selectFunnelDefinition(funnels, funnelKey) {
  if (!Array.isArray(funnels) || funnels.length === 0) {
    return null;
  }

  const normalizedKey = String(funnelKey ?? "").trim().toLowerCase();
  return funnels.find((funnel) => funnel.key === normalizedKey) ?? funnels[0];
}

function buildFunnelEventConditions(step) {
  const params = {};
  const clauses = [];

  if (step.type === "page") {
    clauses.push("te.event_type = 'page_view'");
  }
  if (step.type === "event" && step.event_type) {
    clauses.push("te.event_type = :event_type");
    params.event_type = step.event_type;
  }
  if (step.event_name) {
    clauses.push("te.event_name = :event_name");
    params.event_name = step.event_name;
  }
  if (step.page_path) {
    clauses.push("te.page_path = :page_path");
    params.page_path = step.page_path;
  }
  if (step.page_path_prefix) {
    clauses.push("te.page_path LIKE :page_path_prefix");
    params.page_path_prefix = `${step.page_path_prefix}%`;
  }
  if (step.page_url_contains) {
    clauses.push("te.page_url LIKE :page_url_contains");
    params.page_url_contains = `%${step.page_url_contains}%`;
  }

  return {
    sql: clauses.length > 0 ? `AND ${clauses.join(" AND ")}` : "",
    params
  };
}

function buildFunnelConversionConditions(step) {
  const params = {};
  const clauses = [];

  if (step.conversion_type) {
    clauses.push("c.conversion_type = :conversion_type");
    params.conversion_type = step.conversion_type;
  }
  if (step.page_path) {
    clauses.push("c.page_url LIKE :page_path_contains");
    params.page_path_contains = `%${step.page_path}%`;
  }
  if (step.page_url_contains) {
    clauses.push("c.page_url LIKE :page_url_contains");
    params.page_url_contains = `%${step.page_url_contains}%`;
  }

  return {
    sql: clauses.length > 0 ? `AND ${clauses.join(" AND ")}` : "",
    params
  };
}

function parseObject(value) {
  if (!value) {
    return {};
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function metaString(meta, keys) {
  if (!meta || typeof meta !== "object") {
    return null;
  }

  for (const key of keys) {
    const normalized = String(meta[key] ?? "").trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function createFunnelStep(key, label, count, baseCount) {
  const normalizedCount = Number(count ?? 0);
  const normalizedBase = Number(baseCount ?? 0);
  return {
    key,
    label,
    count: normalizedCount,
    rate_from_sessions: normalizedBase > 0
      ? Number(((normalizedCount / normalizedBase) * 100).toFixed(1))
      : 0
  };
}
