export class AnalyticsRollupRepository {
  constructor(database) {
    this.database = database;
  }

  replaceTrafficRollups(websiteId, rows, options = {}) {
    const { timestamp, bounds } = normalizeOptions(options);
    this.deleteRows("analytics_daily_traffic_rollups", websiteId, bounds, "rollup_date");

    const statement = this.database.prepare(`
      INSERT INTO analytics_daily_traffic_rollups (
        website_id,
        rollup_date,
        visitors,
        sessions,
        pageviews,
        events,
        engaged_sessions,
        conversions,
        created_at,
        updated_at
      ) VALUES (
        :website_id,
        :rollup_date,
        :visitors,
        :sessions,
        :pageviews,
        :events,
        :engaged_sessions,
        :conversions,
        :created_at,
        :updated_at
      )
    `);

    rows.forEach((row) => {
      statement.run({
        website_id: websiteId,
        rollup_date: row.rollupDate,
        visitors: row.visitors,
        sessions: row.sessions,
        pageviews: row.pageviews,
        events: row.events,
        engaged_sessions: row.engagedSessions,
        conversions: row.conversions,
        created_at: timestamp,
        updated_at: timestamp
      });
    });
  }

  replaceDimensionRollups(websiteId, rows, options = {}) {
    const { timestamp, bounds } = normalizeOptions(options);
    this.deleteRows("analytics_daily_dimension_rollups", websiteId, bounds, "report_date");

    const statement = this.database.prepare(`
      INSERT INTO analytics_daily_dimension_rollups (
        website_id,
        report_date,
        dimension_type,
        dimension_key,
        sessions,
        engaged_sessions,
        pageviews,
        events,
        conversions,
        conversion_value,
        created_at,
        updated_at
      ) VALUES (
        :website_id,
        :report_date,
        :dimension_type,
        :dimension_key,
        :sessions,
        :engaged_sessions,
        :pageviews,
        :events,
        :conversions,
        :conversion_value,
        :created_at,
        :updated_at
      )
    `);

    rows.forEach((row) => {
      statement.run({
        website_id: websiteId,
        report_date: row.reportDate,
        dimension_type: row.dimensionType,
        dimension_key: row.dimensionKey,
        sessions: row.sessions,
        engaged_sessions: row.engagedSessions,
        pageviews: row.pageviews,
        events: row.events,
        conversions: row.conversions,
        conversion_value: row.conversionValue,
        created_at: timestamp,
        updated_at: timestamp
      });
    });
  }

  replaceConversionRollups(websiteId, rows, options = {}) {
    const { timestamp, bounds } = normalizeOptions(options);
    this.deleteRows("analytics_daily_conversion_rollups", websiteId, bounds, "rollup_date");

    const statement = this.database.prepare(`
      INSERT INTO analytics_daily_conversion_rollups (
        website_id,
        rollup_date,
        attribution_model,
        conversion_type,
        source_category,
        channel,
        referrer_domain,
        utm_source,
        utm_medium,
        utm_campaign,
        conversions,
        conversion_value,
        created_at,
        updated_at
      ) VALUES (
        :website_id,
        :rollup_date,
        :attribution_model,
        :conversion_type,
        :source_category,
        :channel,
        :referrer_domain,
        :utm_source,
        :utm_medium,
        :utm_campaign,
        :conversions,
        :conversion_value,
        :created_at,
        :updated_at
      )
    `);

    rows.forEach((row) => {
      statement.run({
        website_id: websiteId,
        rollup_date: row.rollupDate,
        attribution_model: row.attributionModel,
        conversion_type: row.conversionType ?? "",
        source_category: row.sourceCategory ?? "",
        channel: row.channel ?? "",
        referrer_domain: row.referrerDomain ?? "",
        utm_source: row.utmSource ?? "",
        utm_medium: row.utmMedium ?? "",
        utm_campaign: row.utmCampaign ?? "",
        conversions: row.conversions,
        conversion_value: row.conversionValue,
        created_at: timestamp,
        updated_at: timestamp
      });
    });
  }

  deleteRows(tableName, websiteId, bounds, dateColumn) {
    if (bounds?.dateFrom && bounds?.dateTo) {
      this.database.prepare(`
        DELETE FROM ${tableName}
        WHERE website_id = :website_id
          AND ${dateColumn} BETWEEN :date_from AND :date_to
      `).run({
        website_id: websiteId,
        date_from: bounds.dateFrom,
        date_to: bounds.dateTo
      });
      return;
    }

    this.database.prepare(`
      DELETE FROM ${tableName}
      WHERE website_id = :website_id
    `).run({
      website_id: websiteId
    });
  }
}

function normalizeOptions(options) {
  if (typeof options === "string") {
    return {
      timestamp: options,
      bounds: null
    };
  }

  return {
    timestamp: options.timestamp ?? new Date().toISOString(),
    bounds: options.bounds ?? null
  };
}
