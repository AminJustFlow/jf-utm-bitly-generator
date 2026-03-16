const ATTRIBUTION_MODELS = ["first_touch", "last_touch", "last_non_direct"];

export class AnalyticsReportingService {
  constructor({
    database,
    websiteRepository,
    conversionAttributionRepository,
    analyticsRollupRepository
  }) {
    this.database = database;
    this.websiteRepository = websiteRepository;
    this.conversionAttributionRepository = conversionAttributionRepository;
    this.analyticsRollupRepository = analyticsRollupRepository;
  }

  refreshWebsite(websiteId) {
    const website = this.websiteRepository.findById(websiteId);
    if (!website) {
      const error = new Error("Website not found.");
      error.code = "website_not_found";
      throw error;
    }

    const sessions = this.database.prepare(`
      SELECT *
      FROM sessions
      WHERE website_id = :website_id
      ORDER BY started_at ASC, id ASC
    `).all({
      website_id: websiteId
    });
    const conversions = this.database.prepare(`
      SELECT *
      FROM conversions
      WHERE website_id = :website_id
      ORDER BY submitted_at ASC, id ASC
    `).all({
      website_id: websiteId
    });
    const sessionsByVisitor = buildSessionsByVisitor(sessions);
    const now = new Date().toISOString();

    this.database.exec("BEGIN");
    try {
      this.conversionAttributionRepository.deleteByWebsiteAndConversionIds(websiteId, conversions.map((conversion) => conversion.id));

      conversions.forEach((conversion) => {
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

      this.analyticsRollupRepository.replaceTrafficRollups(websiteId, this.buildTrafficRollups(websiteId), now);
      this.analyticsRollupRepository.replaceConversionRollups(websiteId, this.buildConversionRollups(websiteId), now);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  buildReport({ websiteId, dateFrom, dateTo, model = "last_touch" }) {
    const normalizedModel = ATTRIBUTION_MODELS.includes(model) ? model : "last_touch";
    const bounds = resolveDateBounds(dateFrom, dateTo);
    const websites = this.websiteRepository.list().map((website) => ({
      id: Number(website.id),
      website_name: website.website_name,
      client_name: website.client_name,
      status: website.status
    }));

    if (!websiteId) {
      return {
        websites,
        filters: {
          website_id: null,
          date_from: bounds.dateFrom,
          date_to: bounds.dateTo,
          model: normalizedModel
        },
        summary: emptySummary(),
        timeseries: [],
        breakdowns: {
          channels: [],
          sources: [],
          campaigns: []
        },
        recent_conversions: []
      };
    }

    return {
      websites,
      filters: {
        website_id: Number(websiteId),
        date_from: bounds.dateFrom,
        date_to: bounds.dateTo,
        model: normalizedModel
      },
      summary: this.summary(Number(websiteId), bounds, normalizedModel),
      timeseries: this.timeseries(Number(websiteId), bounds, normalizedModel),
      breakdowns: {
        channels: this.breakdown(Number(websiteId), bounds, normalizedModel, "channel"),
        sources: this.breakdown(Number(websiteId), bounds, normalizedModel, "utm_source"),
        campaigns: this.breakdown(Number(websiteId), bounds, normalizedModel, "utm_campaign")
      },
      recent_conversions: this.recentConversions(Number(websiteId), bounds, normalizedModel)
    };
  }

  buildTrafficRollups(websiteId) {
    const events = this.database.prepare(`
      SELECT
        substr(occurred_at, 1, 10) AS rollup_date,
        COUNT(*) AS events,
        SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS pageviews,
        COUNT(DISTINCT visitor_id) AS visitors
      FROM tracking_events
      WHERE website_id = :website_id
      GROUP BY substr(occurred_at, 1, 10)
    `).all({
      website_id: websiteId
    });
    const sessions = this.database.prepare(`
      SELECT
        substr(started_at, 1, 10) AS rollup_date,
        COUNT(*) AS sessions,
        SUM(CASE WHEN is_engaged = 1 THEN 1 ELSE 0 END) AS engaged_sessions
      FROM sessions
      WHERE website_id = :website_id
      GROUP BY substr(started_at, 1, 10)
    `).all({
      website_id: websiteId
    });
    const conversions = this.database.prepare(`
      SELECT
        substr(submitted_at, 1, 10) AS rollup_date,
        COUNT(*) AS conversions
      FROM conversions
      WHERE website_id = :website_id
      GROUP BY substr(submitted_at, 1, 10)
    `).all({
      website_id: websiteId
    });
    const rowsByDate = new Map();

    events.forEach((row) => {
      rowsByDate.set(row.rollup_date, {
        rollupDate: row.rollup_date,
        visitors: Number(row.visitors ?? 0),
        sessions: 0,
        pageviews: Number(row.pageviews ?? 0),
        events: Number(row.events ?? 0),
        engagedSessions: 0,
        conversions: 0
      });
    });
    sessions.forEach((row) => {
      const current = rowsByDate.get(row.rollup_date) ?? createEmptyTrafficRow(row.rollup_date);
      current.sessions = Number(row.sessions ?? 0);
      current.engagedSessions = Number(row.engaged_sessions ?? 0);
      rowsByDate.set(row.rollup_date, current);
    });
    conversions.forEach((row) => {
      const current = rowsByDate.get(row.rollup_date) ?? createEmptyTrafficRow(row.rollup_date);
      current.conversions = Number(row.conversions ?? 0);
      rowsByDate.set(row.rollup_date, current);
    });

    return [...rowsByDate.values()].sort((left, right) => left.rollupDate.localeCompare(right.rollupDate));
  }

  buildConversionRollups(websiteId) {
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
    `).all({
      website_id: websiteId
    }).map((row) => ({
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

  summary(websiteId, bounds, model) {
    const traffic = this.database.prepare(`
      SELECT
        COALESCE(SUM(visitors), 0) AS visitors,
        COALESCE(SUM(sessions), 0) AS sessions,
        COALESCE(SUM(pageviews), 0) AS pageviews,
        COALESCE(SUM(events), 0) AS events,
        COALESCE(SUM(engaged_sessions), 0) AS engaged_sessions,
        COALESCE(SUM(conversions), 0) AS raw_conversions
      FROM analytics_daily_traffic_rollups
      WHERE website_id = :website_id
        AND rollup_date BETWEEN :date_from AND :date_to
    `).get({
      website_id: websiteId,
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo
    });
    const attributed = this.database.prepare(`
      SELECT
        COALESCE(SUM(conversions), 0) AS conversions,
        COALESCE(SUM(conversion_value), 0) AS conversion_value
      FROM analytics_daily_conversion_rollups
      WHERE website_id = :website_id
        AND attribution_model = :attribution_model
        AND rollup_date BETWEEN :date_from AND :date_to
    `).get({
      website_id: websiteId,
      attribution_model: model,
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo
    });

    return {
      visitors: Number(traffic.visitors ?? 0),
      sessions: Number(traffic.sessions ?? 0),
      pageviews: Number(traffic.pageviews ?? 0),
      events: Number(traffic.events ?? 0),
      engaged_sessions: Number(traffic.engaged_sessions ?? 0),
      raw_conversions: Number(traffic.raw_conversions ?? 0),
      attributed_conversions: Number(attributed.conversions ?? 0),
      attributed_conversion_value: Number(attributed.conversion_value ?? 0)
    };
  }

  timeseries(websiteId, bounds, model) {
    return this.database.prepare(`
      SELECT
        traffic.rollup_date,
        traffic.visitors,
        traffic.sessions,
        traffic.pageviews,
        traffic.events,
        traffic.engaged_sessions,
        traffic.conversions AS raw_conversions,
        COALESCE(conversions.conversions, 0) AS attributed_conversions,
        COALESCE(conversions.conversion_value, 0) AS attributed_conversion_value
      FROM analytics_daily_traffic_rollups traffic
      LEFT JOIN (
        SELECT
          rollup_date,
          SUM(conversions) AS conversions,
          SUM(conversion_value) AS conversion_value
        FROM analytics_daily_conversion_rollups
        WHERE website_id = :website_id
          AND attribution_model = :attribution_model
          AND rollup_date BETWEEN :date_from AND :date_to
        GROUP BY rollup_date
      ) conversions ON conversions.rollup_date = traffic.rollup_date
      WHERE traffic.website_id = :website_id
        AND traffic.rollup_date BETWEEN :date_from AND :date_to
      ORDER BY traffic.rollup_date ASC
    `).all({
      website_id: websiteId,
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
      raw_conversions: Number(row.raw_conversions ?? 0),
      attributed_conversions: Number(row.attributed_conversions ?? 0),
      attributed_conversion_value: Number(row.attributed_conversion_value ?? 0)
    }));
  }

  breakdown(websiteId, bounds, model, field) {
    return this.database.prepare(`
      SELECT
        ${field} AS label,
        SUM(conversions) AS conversions,
        SUM(conversion_value) AS conversion_value
      FROM analytics_daily_conversion_rollups
      WHERE website_id = :website_id
        AND attribution_model = :attribution_model
        AND rollup_date BETWEEN :date_from AND :date_to
      GROUP BY ${field}
      HAVING SUM(conversions) > 0
      ORDER BY conversions DESC, conversion_value DESC, label ASC
      LIMIT 10
    `).all({
      website_id: websiteId,
      attribution_model: model,
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo
    }).map((row) => ({
      label: row.label || "(direct / none)",
      conversions: Number(row.conversions ?? 0),
      conversion_value: Number(row.conversion_value ?? 0)
    }));
  }

  recentConversions(websiteId, bounds, model) {
    return this.database.prepare(`
      SELECT
        c.conversion_uuid,
        c.conversion_type,
        c.page_url,
        c.value,
        c.submitted_at,
        ca.channel,
        ca.source_category,
        ca.utm_source,
        ca.utm_medium,
        ca.utm_campaign
      FROM conversions c
      LEFT JOIN conversion_attributions ca
        ON ca.conversion_id = c.id
       AND ca.model_key = :attribution_model
      WHERE c.website_id = :website_id
        AND substr(c.submitted_at, 1, 10) BETWEEN :date_from AND :date_to
      ORDER BY c.submitted_at DESC, c.id DESC
      LIMIT 12
    `).all({
      website_id: websiteId,
      attribution_model: model,
      date_from: bounds.dateFrom,
      date_to: bounds.dateTo
    }).map((row) => ({
      conversion_uuid: row.conversion_uuid,
      conversion_type: row.conversion_type,
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

function normalizeDateOnly(value) {
  const normalized = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/u.test(normalized) ? normalized : null;
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

function emptySummary() {
  return {
    visitors: 0,
    sessions: 0,
    pageviews: 0,
    events: 0,
    engaged_sessions: 0,
    raw_conversions: 0,
    attributed_conversions: 0,
    attributed_conversion_value: 0
  };
}
