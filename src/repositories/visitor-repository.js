import { encodeJson } from "../support/json.js";

export class VisitorRepository {
  constructor(database) {
    this.database = database;
  }

  findByWebsiteAndVisitorUuid(websiteId, visitorUuid) {
    return this.database.prepare(`
      SELECT *
      FROM visitors
      WHERE website_id = :website_id
        AND visitor_uuid = :visitor_uuid
      LIMIT 1
    `).get({
      website_id: websiteId,
      visitor_uuid: visitorUuid
    }) ?? null;
  }

  create(payload) {
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO visitors (
        website_id,
        visitor_uuid,
        first_seen_at,
        last_seen_at,
        lead_email_hash,
        lead_phone_hash,
        stitched_profile_id,
        metadata_json
      ) VALUES (
        :website_id,
        :visitor_uuid,
        :first_seen_at,
        :last_seen_at,
        :lead_email_hash,
        :lead_phone_hash,
        :stitched_profile_id,
        :metadata_json
      )
    `).run({
      website_id: payload.websiteId,
      visitor_uuid: payload.visitorUuid,
      first_seen_at: payload.firstSeenAt,
      last_seen_at: payload.lastSeenAt,
      lead_email_hash: payload.leadEmailHash ?? null,
      lead_phone_hash: payload.leadPhoneHash ?? null,
      stitched_profile_id: payload.stitchedProfileId ?? null,
      metadata_json: encodeJson(payload.metadataJson ?? {})
    });

    return Number(result.changes ?? 0) > 0 ? Number(result.lastInsertRowid) : null;
  }

  touchLastSeen(id, fields = {}) {
    this.database.prepare(`
      UPDATE visitors
      SET last_seen_at = CASE
            WHEN last_seen_at IS NULL OR last_seen_at < :last_seen_at THEN :last_seen_at
            ELSE last_seen_at
          END,
          lead_email_hash = COALESCE(:lead_email_hash, lead_email_hash),
          lead_phone_hash = COALESCE(:lead_phone_hash, lead_phone_hash),
          metadata_json = COALESCE(:metadata_json, metadata_json)
      WHERE id = :id
    `).run({
      id,
      last_seen_at: fields.lastSeenAt ?? new Date().toISOString(),
      lead_email_hash: fields.leadEmailHash ?? null,
      lead_phone_hash: fields.leadPhoneHash ?? null,
      metadata_json: fields.metadataJson ? encodeJson(fields.metadataJson) : null
    });
  }

  assignStitchedProfile(id, stitchedProfileId, updatedAt = new Date().toISOString()) {
    this.database.prepare(`
      UPDATE visitors
      SET stitched_profile_id = :stitched_profile_id,
          last_seen_at = CASE
            WHEN last_seen_at IS NULL OR last_seen_at < :updated_at THEN :updated_at
            ELSE last_seen_at
          END
      WHERE id = :id
    `).run({
      id,
      stitched_profile_id: stitchedProfileId,
      updated_at: updatedAt
    });
  }
}
