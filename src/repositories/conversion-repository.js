import { encodeJson } from "../support/json.js";

export class ConversionRepository {
  constructor(database) {
    this.database = database;
  }

  insert(payload) {
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO conversions (
        website_id,
        visitor_id,
        session_id,
        conversion_uuid,
        conversion_type,
        form_provider,
        form_id,
        form_title,
        page_url,
        value,
        attribution_json,
        submitted_at,
        received_at
      ) VALUES (
        :website_id,
        :visitor_id,
        :session_id,
        :conversion_uuid,
        :conversion_type,
        :form_provider,
        :form_id,
        :form_title,
        :page_url,
        :value,
        :attribution_json,
        :submitted_at,
        :received_at
      )
    `).run({
      website_id: payload.websiteId,
      visitor_id: payload.visitorId,
      session_id: payload.sessionId,
      conversion_uuid: payload.conversionUuid,
      conversion_type: payload.conversionType,
      form_provider: payload.formProvider ?? null,
      form_id: payload.formId ?? null,
      form_title: payload.formTitle ?? null,
      page_url: payload.pageUrl ?? null,
      value: payload.value ?? null,
      attribution_json: encodeJson(payload.attributionJson ?? {}),
      submitted_at: payload.submittedAt,
      received_at: payload.receivedAt
    });

    return Number(result.changes ?? 0) > 0 ? Number(result.lastInsertRowid) : null;
  }
}
