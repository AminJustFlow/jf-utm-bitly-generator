import { encodeJson } from "../support/json.js";

export class WebsiteInstallationEventRepository {
  constructor(database) {
    this.database = database;
  }

  create(payload) {
    const result = this.database.prepare(`
      INSERT INTO website_installation_events (
        website_id,
        installation_row_id,
        event_type,
        plugin_version,
        wp_version,
        php_version,
        status,
        details_json,
        occurred_at,
        received_at
      ) VALUES (
        :website_id,
        :installation_row_id,
        :event_type,
        :plugin_version,
        :wp_version,
        :php_version,
        :status,
        :details_json,
        :occurred_at,
        :received_at
      )
    `).run({
      website_id: payload.websiteId,
      installation_row_id: payload.installationRowId,
      event_type: payload.eventType,
      plugin_version: payload.pluginVersion ?? null,
      wp_version: payload.wpVersion ?? null,
      php_version: payload.phpVersion ?? null,
      status: payload.status ?? null,
      details_json: encodeJson(payload.detailsJson ?? {}),
      occurred_at: payload.occurredAt,
      received_at: payload.receivedAt
    });

    return Number(result.lastInsertRowid);
  }

  listByWebsiteId(websiteId, limit = 50) {
    return this.database.prepare(`
      SELECT *
      FROM website_installation_events
      WHERE website_id = :website_id
      ORDER BY occurred_at DESC, id DESC
      LIMIT :limit
    `).all({
      website_id: websiteId,
      limit
    });
  }
}
