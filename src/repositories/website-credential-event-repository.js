import { encodeJson } from "../support/json.js";

export class WebsiteCredentialEventRepository {
  constructor(database) {
    this.database = database;
  }

  create(payload) {
    const result = this.database.prepare(`
      INSERT INTO website_credential_events (
        website_id,
        action,
        public_key,
        credentials_version,
        details_json,
        created_at
      ) VALUES (
        :website_id,
        :action,
        :public_key,
        :credentials_version,
        :details_json,
        :created_at
      )
    `).run({
      website_id: payload.websiteId,
      action: payload.action,
      public_key: payload.publicKey,
      credentials_version: payload.credentialsVersion,
      details_json: encodeJson(payload.detailsJson ?? {}),
      created_at: payload.createdAt
    });

    return Number(result.lastInsertRowid);
  }

  listByWebsiteId(websiteId, limit = 20) {
    return this.database.prepare(`
      SELECT *
      FROM website_credential_events
      WHERE website_id = :website_id
      ORDER BY created_at DESC, id DESC
      LIMIT :limit
    `).all({
      website_id: websiteId,
      limit
    });
  }
}
