export class AnalyticsRollupRepository {
  constructor(database) {
    this.database = database;
  }

  replaceTrafficRollups(websiteId, rows, timestamp = new Date().toISOString()) {
    this.database.prepare(`
      DELETE FROM analytics_daily_traffic_rollups
      WHERE website_id = :website_id
    `).run({
      website_id: websiteId
    });

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

  replaceConversionRollups(websiteId, rows, timestamp = new Date().toISOString()) {
    this.database.prepare(`
      DELETE FROM analytics_daily_conversion_rollups
      WHERE website_id = :website_id
    `).run({
      website_id: websiteId
    });

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
}
