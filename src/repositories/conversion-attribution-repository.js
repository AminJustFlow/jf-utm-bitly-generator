export class ConversionAttributionRepository {
  constructor(database) {
    this.database = database;
  }

  deleteByWebsite(websiteId) {
    this.database.prepare(`
      DELETE FROM conversion_attributions
      WHERE website_id = :website_id
    `).run({
      website_id: websiteId
    });
  }

  deleteByWebsiteAndDates(websiteId, dates) {
    if (!Array.isArray(dates) || dates.length === 0) {
      return;
    }

    const params = { website_id: websiteId };
    const placeholders = dates.map((date, index) => {
      params[`date_${index}`] = date;
      return `:date_${index}`;
    }).join(", ");

    this.database.prepare(`
      DELETE FROM conversion_attributions
      WHERE website_id = :website_id
        AND substr(created_at, 1, 10) IN (${placeholders})
    `).run(params);
  }

  deleteByWebsiteAndConversionIds(websiteId, conversionIds) {
    if (!Array.isArray(conversionIds) || conversionIds.length === 0) {
      this.deleteByWebsite(websiteId);
      return;
    }

    const params = { website_id: websiteId };
    const placeholders = conversionIds.map((id, index) => {
      params[`conversion_id_${index}`] = id;
      return `:conversion_id_${index}`;
    }).join(", ");

    this.database.prepare(`
      DELETE FROM conversion_attributions
      WHERE website_id = :website_id
        AND conversion_id IN (${placeholders})
    `).run(params);
  }

  upsert(payload) {
    this.database.prepare(`
      INSERT INTO conversion_attributions (
        website_id,
        conversion_id,
        conversion_uuid,
        model_key,
        attributed_session_id,
        attributed_visitor_id,
        source_category,
        channel,
        referrer_domain,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        is_direct,
        created_at,
        updated_at
      ) VALUES (
        :website_id,
        :conversion_id,
        :conversion_uuid,
        :model_key,
        :attributed_session_id,
        :attributed_visitor_id,
        :source_category,
        :channel,
        :referrer_domain,
        :utm_source,
        :utm_medium,
        :utm_campaign,
        :utm_term,
        :utm_content,
        :is_direct,
        :created_at,
        :updated_at
      )
      ON CONFLICT(conversion_id, model_key) DO UPDATE SET
        attributed_session_id = excluded.attributed_session_id,
        attributed_visitor_id = excluded.attributed_visitor_id,
        source_category = excluded.source_category,
        channel = excluded.channel,
        referrer_domain = excluded.referrer_domain,
        utm_source = excluded.utm_source,
        utm_medium = excluded.utm_medium,
        utm_campaign = excluded.utm_campaign,
        utm_term = excluded.utm_term,
        utm_content = excluded.utm_content,
        is_direct = excluded.is_direct,
        updated_at = excluded.updated_at
    `).run({
      website_id: payload.websiteId,
      conversion_id: payload.conversionId,
      conversion_uuid: payload.conversionUuid,
      model_key: payload.modelKey,
      attributed_session_id: payload.attributedSessionId ?? null,
      attributed_visitor_id: payload.attributedVisitorId ?? null,
      source_category: payload.sourceCategory ?? "",
      channel: payload.channel ?? "",
      referrer_domain: payload.referrerDomain ?? "",
      utm_source: payload.utmSource ?? "",
      utm_medium: payload.utmMedium ?? "",
      utm_campaign: payload.utmCampaign ?? "",
      utm_term: payload.utmTerm ?? "",
      utm_content: payload.utmContent ?? "",
      is_direct: payload.isDirect ? 1 : 0,
      created_at: payload.createdAt,
      updated_at: payload.updatedAt
    });
  }

  listByWebsiteId(websiteId, modelKey) {
    return this.database.prepare(`
      SELECT *
      FROM conversion_attributions
      WHERE website_id = :website_id
        AND model_key = :model_key
      ORDER BY id ASC
    `).all({
      website_id: websiteId,
      model_key: modelKey
    });
  }
}
