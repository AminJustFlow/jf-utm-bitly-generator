import { encodeJson } from "../support/json.js";

export class SessionRepository {
  constructor(database) {
    this.database = database;
  }

  findByWebsiteAndSessionUuid(websiteId, sessionUuid) {
    return this.database.prepare(`
      SELECT *
      FROM sessions
      WHERE website_id = :website_id
        AND session_uuid = :session_uuid
      LIMIT 1
    `).get({
      website_id: websiteId,
      session_uuid: sessionUuid
    }) ?? null;
  }

  create(payload) {
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO sessions (
        website_id,
        visitor_id,
        session_uuid,
        started_at,
        ended_at,
        landing_page_url,
        exit_page_url,
        referrer_url,
        referrer_domain,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        gclid,
        fbclid,
        msclkid,
        ttclid,
        qr_id,
        channel,
        source_category,
        device_type,
        browser_name,
        is_direct,
        pageviews,
        engagement_seconds,
        is_engaged,
        consent_state_json,
        consent_updated_at,
        created_at,
        updated_at
      ) VALUES (
        :website_id,
        :visitor_id,
        :session_uuid,
        :started_at,
        :ended_at,
        :landing_page_url,
        :exit_page_url,
        :referrer_url,
        :referrer_domain,
        :utm_source,
        :utm_medium,
        :utm_campaign,
        :utm_term,
        :utm_content,
        :gclid,
        :fbclid,
        :msclkid,
        :ttclid,
        :qr_id,
        :channel,
        :source_category,
        :device_type,
        :browser_name,
        :is_direct,
        :pageviews,
        :engagement_seconds,
        :is_engaged,
        :consent_state_json,
        :consent_updated_at,
        :created_at,
        :updated_at
      )
    `).run({
      website_id: payload.websiteId,
      visitor_id: payload.visitorId,
      session_uuid: payload.sessionUuid,
      started_at: payload.startedAt,
      ended_at: payload.endedAt ?? null,
      landing_page_url: payload.landingPageUrl ?? null,
      exit_page_url: payload.exitPageUrl ?? null,
      referrer_url: payload.referrerUrl ?? null,
      referrer_domain: payload.referrerDomain ?? null,
      utm_source: payload.utmSource ?? null,
      utm_medium: payload.utmMedium ?? null,
      utm_campaign: payload.utmCampaign ?? null,
      utm_term: payload.utmTerm ?? null,
      utm_content: payload.utmContent ?? null,
      gclid: payload.gclid ?? null,
      fbclid: payload.fbclid ?? null,
      msclkid: payload.msclkid ?? null,
      ttclid: payload.ttclid ?? null,
      qr_id: payload.qrId ?? null,
      channel: payload.channel ?? null,
      source_category: payload.sourceCategory ?? null,
      device_type: payload.deviceType ?? null,
      browser_name: payload.browserName ?? null,
      is_direct: payload.isDirect ? 1 : 0,
      pageviews: Number(payload.pageviews ?? 0),
      engagement_seconds: Number(payload.engagementSeconds ?? 0),
      is_engaged: payload.isEngaged ? 1 : 0,
      consent_state_json: encodeJson(payload.consentStateJson ?? {}),
      consent_updated_at: payload.consentUpdatedAt ?? null,
      created_at: payload.createdAt,
      updated_at: payload.updatedAt
    });

    return Number(result.changes ?? 0) > 0 ? Number(result.lastInsertRowid) : null;
  }

  updateFromEvent(id, fields = {}) {
    const payload = {
      ...fields,
      updated_at: fields.updated_at ?? new Date().toISOString()
    };
    const assignments = Object.keys(payload)
      .map((field) => `${field} = :${field}`)
      .join(", ");

    this.database.prepare(`
      UPDATE sessions
      SET ${assignments}
      WHERE id = :id
    `).run({
      id,
      ...serializeSessionFields(payload)
    });
  }

  incrementPageviews(id, amount = 1) {
    this.database.prepare(`
      UPDATE sessions
      SET pageviews = pageviews + :amount,
          updated_at = :updated_at
      WHERE id = :id
    `).run({
      id,
      amount,
      updated_at: new Date().toISOString()
    });
  }
}

function serializeSessionFields(fields) {
  const serialized = {};
  Object.entries(fields).forEach(([key, value]) => {
    serialized[key] = key.endsWith("_json") && value && typeof value === "object"
      ? encodeJson(value)
      : value;
  });
  return serialized;
}
