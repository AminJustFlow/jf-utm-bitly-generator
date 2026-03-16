import { encodeJson } from "../support/json.js";

export class WebsiteInstallationRepository {
  constructor(database) {
    this.database = database;
  }

  findByWebsiteAndInstallationId(websiteId, installationId) {
    return this.database.prepare(`
      SELECT *
      FROM website_installations
      WHERE website_id = :website_id
        AND installation_id = :installation_id
      LIMIT 1
    `).get({
      website_id: websiteId,
      installation_id: installationId
    }) ?? null;
  }

  create(payload) {
    const result = this.database.prepare(`
      INSERT INTO website_installations (
        website_id,
        installation_id,
        plugin_version,
        wp_version,
        php_version,
        status,
        wp_multisite_enabled,
        wp_network_id,
        wp_network_name,
        wp_site_id,
        wp_site_url,
        wp_site_path,
        first_seen_at,
        last_seen_at,
        last_heartbeat_at,
        last_batch_received_at,
        last_config_fetched_at,
        last_sent_at,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (
        :website_id,
        :installation_id,
        :plugin_version,
        :wp_version,
        :php_version,
        :status,
        :wp_multisite_enabled,
        :wp_network_id,
        :wp_network_name,
        :wp_site_id,
        :wp_site_url,
        :wp_site_path,
        :first_seen_at,
        :last_seen_at,
        :last_heartbeat_at,
        :last_batch_received_at,
        :last_config_fetched_at,
        :last_sent_at,
        :metadata_json,
        :created_at,
        :updated_at
      )
    `).run({
      website_id: payload.websiteId,
      installation_id: payload.installationId,
      plugin_version: payload.pluginVersion ?? null,
      wp_version: payload.wpVersion ?? null,
      php_version: payload.phpVersion ?? null,
      status: payload.status ?? "active",
      wp_multisite_enabled: payload.wpMultisiteEnabled ? 1 : 0,
      wp_network_id: payload.wpNetworkId ?? null,
      wp_network_name: payload.wpNetworkName ?? null,
      wp_site_id: payload.wpSiteId ?? null,
      wp_site_url: payload.wpSiteUrl ?? null,
      wp_site_path: payload.wpSitePath ?? null,
      first_seen_at: payload.firstSeenAt,
      last_seen_at: payload.lastSeenAt,
      last_heartbeat_at: payload.lastHeartbeatAt ?? null,
      last_batch_received_at: payload.lastBatchReceivedAt ?? null,
      last_config_fetched_at: payload.lastConfigFetchedAt ?? null,
      last_sent_at: payload.lastSentAt ?? null,
      metadata_json: encodeJson(payload.metadataJson ?? {}),
      created_at: payload.createdAt,
      updated_at: payload.updatedAt
    });

    return Number(result.lastInsertRowid);
  }

  update(id, fields) {
    const payload = {
      ...fields,
      updated_at: fields.updated_at ?? new Date().toISOString()
    };
    const assignments = Object.keys(payload)
      .map((field) => `${field} = :${field}`)
      .join(", ");

    this.database.prepare(`
      UPDATE website_installations
      SET ${assignments}
      WHERE id = :id
    `).run({
      id,
      ...payload
    });
  }

  listByWebsiteId(websiteId) {
    return this.database.prepare(`
      SELECT *
      FROM website_installations
      WHERE website_id = :website_id
      ORDER BY last_seen_at DESC, id DESC
    `).all({
      website_id: websiteId
    });
  }

  listAll() {
    return this.database.prepare(`
      SELECT *
      FROM website_installations
      ORDER BY last_seen_at DESC, id DESC
    `).all();
  }
}
