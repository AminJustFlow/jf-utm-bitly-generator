import { decodeJson, encodeJson } from "../support/json.js";

export class WebsiteObservabilityEventRepository {
  constructor(database) {
    this.database = database;
  }

  create(payload) {
    const result = this.database.prepare(`
      INSERT INTO website_observability_events (
        website_id,
        installation_id,
        plugin_version,
        event_type,
        error_code,
        message,
        details_json,
        occurred_at
      ) VALUES (
        :website_id,
        :installation_id,
        :plugin_version,
        :event_type,
        :error_code,
        :message,
        :details_json,
        :occurred_at
      )
    `).run({
      website_id: payload.websiteId,
      installation_id: payload.installationId ?? null,
      plugin_version: payload.pluginVersion ?? null,
      event_type: payload.eventType,
      error_code: payload.errorCode ?? null,
      message: payload.message,
      details_json: encodeJson(payload.detailsJson ?? {}),
      occurred_at: payload.occurredAt ?? new Date().toISOString()
    });

    return Number(result.lastInsertRowid);
  }

  listByWebsiteId(websiteId, limit = 25) {
    return this.database.prepare(`
      SELECT *
      FROM website_observability_events
      WHERE website_id = :website_id
      ORDER BY occurred_at DESC, id DESC
      LIMIT :limit
    `).all({
      website_id: websiteId,
      limit: Number(limit)
    }).map((row) => ({
      ...row,
      details: decodeJson(row.details_json)
    }));
  }

  summarizeByWebsiteIds(websiteIds, recentSince = null) {
    const ids = normalizeIds(websiteIds);
    if (ids.length === 0) {
      return [];
    }

    const hasRecentWindow = Boolean(recentSince);
    return this.database.prepare(`
      SELECT
        website_id,
        COALESCE(installation_id, '') AS installation_id,
        event_type,
        COUNT(*) AS total_count,
        MAX(occurred_at) AS last_occurred_at,
        ${hasRecentWindow
    ? "SUM(CASE WHEN occurred_at >= :recent_since THEN 1 ELSE 0 END)"
    : "COUNT(*)"} AS recent_count
      FROM website_observability_events
      WHERE website_id IN (${ids.join(", ")})
      GROUP BY website_id, COALESCE(installation_id, ''), event_type
      ORDER BY website_id ASC, installation_id ASC, event_type ASC
    `).all(hasRecentWindow ? { recent_since: recentSince } : {}).map((row) => ({
      website_id: Number(row.website_id),
      installation_id: row.installation_id || null,
      event_type: row.event_type,
      total_count: Number(row.total_count ?? 0),
      recent_count: Number(row.recent_count ?? 0),
      last_occurred_at: row.last_occurred_at ?? null
    }));
  }
}

function normalizeIds(values) {
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}
