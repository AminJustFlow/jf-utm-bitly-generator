import { serializeTrackingConfig } from "../domain/tracking-config.js";

export class WebsiteRepository {
  constructor(database) {
    this.database = database;
  }

  create(payload) {
    const result = this.database.prepare(`
      INSERT INTO websites (
        client_id,
        client_name,
        website_name,
        base_url,
        platform_type,
        environment,
        status,
        public_key,
        secret_key_hash,
        secret_key_encrypted,
        config_version,
        config_json,
        installed_plugin_version,
        wp_multisite_enabled,
        wp_network_id,
        wp_network_name,
        wp_site_id,
        wp_site_path,
        created_at,
        updated_at,
        last_seen_at
      ) VALUES (
        :client_id,
        :client_name,
        :website_name,
        :base_url,
        :platform_type,
        :environment,
        :status,
        :public_key,
        :secret_key_hash,
        :secret_key_encrypted,
        :config_version,
        :config_json,
        :installed_plugin_version,
        :wp_multisite_enabled,
        :wp_network_id,
        :wp_network_name,
        :wp_site_id,
        :wp_site_path,
        :created_at,
        :updated_at,
        :last_seen_at
      )
    `).run({
      client_id: payload.clientId ?? null,
      client_name: payload.clientName,
      website_name: payload.websiteName,
      base_url: payload.baseUrl,
      platform_type: payload.platformType ?? "wordpress",
      environment: payload.environment ?? "production",
      status: payload.status ?? "active",
      public_key: payload.publicKey,
      secret_key_hash: payload.secretKeyHash,
      secret_key_encrypted: payload.secretKeyEncrypted,
      config_version: payload.configVersion ?? 1,
      config_json: serializeTrackingConfig(payload.configJson),
      installed_plugin_version: payload.installedPluginVersion ?? null,
      wp_multisite_enabled: payload.wpMultisiteEnabled ? 1 : 0,
      wp_network_id: payload.wpNetworkId ?? null,
      wp_network_name: payload.wpNetworkName ?? null,
      wp_site_id: payload.wpSiteId ?? null,
      wp_site_path: payload.wpSitePath ?? null,
      created_at: payload.createdAt,
      updated_at: payload.updatedAt,
      last_seen_at: payload.lastSeenAt ?? null
    });

    return Number(result.lastInsertRowid);
  }

  findById(id) {
    return this.database.prepare("SELECT * FROM websites WHERE id = :id LIMIT 1")
      .get({ id }) ?? null;
  }

  findByPublicKey(publicKey) {
    return this.database.prepare("SELECT * FROM websites WHERE public_key = :public_key LIMIT 1")
      .get({ public_key: publicKey }) ?? null;
  }

  list() {
    return this.database.prepare(`
      SELECT *
      FROM websites
      ORDER BY client_name COLLATE NOCASE ASC, website_name COLLATE NOCASE ASC, id ASC
    `).all();
  }

  updateHeartbeat(id, fields = {}) {
    this.database.prepare(`
      UPDATE websites
      SET last_seen_at = :last_seen_at,
          installed_plugin_version = COALESCE(:installed_plugin_version, installed_plugin_version),
          updated_at = :updated_at
      WHERE id = :id
    `).run({
      id,
      last_seen_at: fields.lastSeenAt ?? new Date().toISOString(),
      installed_plugin_version: fields.installedPluginVersion ?? null,
      updated_at: fields.updatedAt ?? new Date().toISOString()
    });
  }

  updateConfig(id, fields) {
    this.database.prepare(`
      UPDATE websites
      SET config_version = :config_version,
          config_json = :config_json,
          updated_at = :updated_at
      WHERE id = :id
    `).run({
      id,
      config_version: fields.configVersion,
      config_json: serializeTrackingConfig(fields.configJson),
      updated_at: fields.updatedAt ?? new Date().toISOString()
    });
  }

  updateCredentials(id, fields) {
    this.database.prepare(`
      UPDATE websites
      SET public_key = :public_key,
          secret_key_hash = :secret_key_hash,
          secret_key_encrypted = :secret_key_encrypted,
          credentials_version = :credentials_version,
          last_credentials_rotated_at = :last_credentials_rotated_at,
          updated_at = :updated_at
      WHERE id = :id
    `).run({
      id,
      public_key: fields.publicKey,
      secret_key_hash: fields.secretKeyHash,
      secret_key_encrypted: fields.secretKeyEncrypted,
      credentials_version: fields.credentialsVersion,
      last_credentials_rotated_at: fields.lastCredentialsRotatedAt ?? new Date().toISOString(),
      updated_at: fields.updatedAt ?? new Date().toISOString()
    });
  }

  updateStatus(id, status, updatedAt = new Date().toISOString()) {
    this.database.prepare(`
      UPDATE websites
      SET status = :status,
          updated_at = :updated_at
      WHERE id = :id
    `).run({
      id,
      status,
      updated_at: updatedAt
    });
  }

  updateWordpressContext(id, fields = {}) {
    const payload = {
      updated_at: fields.updatedAt ?? new Date().toISOString()
    };

    if (fields.wpMultisiteEnabled !== undefined) {
      payload.wp_multisite_enabled = fields.wpMultisiteEnabled ? 1 : 0;
    }
    if (fields.wpNetworkId !== undefined) {
      payload.wp_network_id = fields.wpNetworkId ?? null;
    }
    if (fields.wpNetworkName !== undefined) {
      payload.wp_network_name = fields.wpNetworkName ?? null;
    }
    if (fields.wpSiteId !== undefined) {
      payload.wp_site_id = fields.wpSiteId ?? null;
    }
    if (fields.wpSitePath !== undefined) {
      payload.wp_site_path = fields.wpSitePath ?? null;
    }

    const assignments = Object.keys(payload)
      .map((field) => `${field} = :${field}`)
      .join(", ");

    this.database.prepare(`
      UPDATE websites
      SET ${assignments}
      WHERE id = :id
    `).run({
      id,
      ...payload
    });
  }
}
