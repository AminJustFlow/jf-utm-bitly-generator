import { encodeJson } from "../support/json.js";

export class TrackingEventRepository {
  constructor(database) {
    this.database = database;
  }

  insert(payload) {
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO tracking_events (
        website_id,
        visitor_id,
        session_id,
        event_uuid,
        event_type,
        event_name,
        page_url,
        page_path,
        referrer_url,
        element_id,
        element_text,
        link_url,
        dedupe_key,
        value,
        meta_json,
        occurred_at,
        received_at
      ) VALUES (
        :website_id,
        :visitor_id,
        :session_id,
        :event_uuid,
        :event_type,
        :event_name,
        :page_url,
        :page_path,
        :referrer_url,
        :element_id,
        :element_text,
        :link_url,
        :dedupe_key,
        :value,
        :meta_json,
        :occurred_at,
        :received_at
      )
    `).run({
      website_id: payload.websiteId,
      visitor_id: payload.visitorId,
      session_id: payload.sessionId,
      event_uuid: payload.eventUuid,
      event_type: payload.eventType,
      event_name: payload.eventName ?? null,
      page_url: payload.pageUrl ?? null,
      page_path: payload.pagePath ?? null,
      referrer_url: payload.referrerUrl ?? null,
      element_id: payload.elementId ?? null,
      element_text: payload.elementText ?? null,
      link_url: payload.linkUrl ?? null,
      dedupe_key: payload.dedupeKey ?? null,
      value: payload.value ?? null,
      meta_json: encodeJson(payload.metaJson ?? {}),
      occurred_at: payload.occurredAt,
      received_at: payload.receivedAt
    });

    return Number(result.changes ?? 0) > 0 ? Number(result.lastInsertRowid) : null;
  }

  existsByEventUuid(websiteId, eventUuid) {
    const row = this.database.prepare(`
      SELECT 1 AS exists_value
      FROM tracking_events
      WHERE website_id = :website_id
        AND event_uuid = :event_uuid
      LIMIT 1
    `).get({
      website_id: websiteId,
      event_uuid: eventUuid
    });

    return Boolean(row?.exists_value);
  }
}
