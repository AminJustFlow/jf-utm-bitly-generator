import { encodeJson, decodeJson } from "../support/json.js";

export class PluginTelemetryService {
  constructor({
    websiteRepository,
    websiteInstallationRepository,
    websiteInstallationEventRepository
  }) {
    this.websiteRepository = websiteRepository;
    this.websiteInstallationRepository = websiteInstallationRepository;
    this.websiteInstallationEventRepository = websiteInstallationEventRepository;
  }

  recordBatch(website, payload, receivedAt = new Date().toISOString()) {
    const occurredAt = payload.sent_at ?? receivedAt;
    const wordpress = normalizeWordpressContext(payload.wordpress);
    const installation = this.upsertInstallation(website.id, payload.installation_id, {
      pluginVersion: payload.plugin_version,
      lastSeenAt: receivedAt,
      lastBatchReceivedAt: receivedAt,
      lastSentAt: occurredAt,
      wordpress,
      metadataJson: {
        last_batch_event_count: Array.isArray(payload.events) ? payload.events.length : 0
      }
    });

    this.websiteInstallationEventRepository.create({
      websiteId: website.id,
      installationRowId: installation.id,
      eventType: "batch_received",
      pluginVersion: payload.plugin_version,
      status: installation.status,
      detailsJson: {
        event_count: Array.isArray(payload.events) ? payload.events.length : 0,
        wordpress
      },
      occurredAt,
      receivedAt
    });

    return installation;
  }

  recordHeartbeat(website, payload, receivedAt = new Date().toISOString()) {
    const wordpress = normalizeWordpressContext(payload.wordpress);
    const installation = this.upsertInstallation(website.id, payload.installation_id, {
      pluginVersion: payload.plugin_version,
      wpVersion: payload.wp_version,
      phpVersion: payload.php_version,
      status: payload.status,
      lastSeenAt: receivedAt,
      lastHeartbeatAt: receivedAt,
      wordpress,
      metadataJson: {}
    });

    this.websiteInstallationEventRepository.create({
      websiteId: website.id,
      installationRowId: installation.id,
      eventType: "heartbeat",
      pluginVersion: payload.plugin_version,
      wpVersion: payload.wp_version,
      phpVersion: payload.php_version,
      status: payload.status,
      detailsJson: {
        wordpress
      },
      occurredAt: receivedAt,
      receivedAt
    });

    return installation;
  }

  recordConfigFetch(website, payload, receivedAt = new Date().toISOString()) {
    if (!payload?.installation_id) {
      return null;
    }

    const installation = this.upsertInstallation(website.id, payload.installation_id, {
      pluginVersion: payload.plugin_version ?? null,
      lastSeenAt: receivedAt,
      lastConfigFetchedAt: receivedAt,
      metadataJson: {}
    });

    this.websiteInstallationEventRepository.create({
      websiteId: website.id,
      installationRowId: installation.id,
      eventType: "config_fetched",
      pluginVersion: payload.plugin_version ?? null,
      status: installation.status,
      detailsJson: {
        query: payload.query ?? {}
      },
      occurredAt: receivedAt,
      receivedAt
    });

    return installation;
  }

  upsertInstallation(websiteId, installationId, fields) {
    const now = fields.lastSeenAt ?? new Date().toISOString();
    const existing = this.websiteInstallationRepository.findByWebsiteAndInstallationId(websiteId, installationId);
    const wordpress = normalizeWordpressContext(fields.wordpress);
    const hasWordpressPayload = fields.wordpress !== undefined && fields.wordpress !== null;

    if (!existing) {
      const installationIdValue = this.websiteInstallationRepository.create({
        websiteId,
        installationId,
        pluginVersion: fields.pluginVersion ?? null,
        wpVersion: fields.wpVersion ?? null,
        phpVersion: fields.phpVersion ?? null,
        status: fields.status ?? "active",
        wpMultisiteEnabled: wordpress.multisite_enabled,
        wpNetworkId: wordpress.network_id,
        wpNetworkName: wordpress.network_name,
        wpSiteId: wordpress.site_id,
        wpSiteUrl: wordpress.site_url,
        wpSitePath: wordpress.site_path,
        firstSeenAt: now,
        lastSeenAt: now,
        lastHeartbeatAt: fields.lastHeartbeatAt ?? null,
        lastBatchReceivedAt: fields.lastBatchReceivedAt ?? null,
        lastConfigFetchedAt: fields.lastConfigFetchedAt ?? null,
        lastSentAt: fields.lastSentAt ?? null,
        metadataJson: fields.metadataJson ?? {},
        createdAt: now,
        updatedAt: now
      });

      const created = this.websiteInstallationRepository.findByWebsiteAndInstallationId(websiteId, installationId);
      if (!created) {
        throw new Error(`Unable to create installation ${installationIdValue}.`);
      }

      this.syncWebsiteWordpressContext(websiteId, wordpress, hasWordpressPayload, now);
      this.websiteInstallationEventRepository.create({
        websiteId,
        installationRowId: created.id,
        eventType: "version_changed",
        pluginVersion: created.plugin_version,
        wpVersion: created.wp_version,
        phpVersion: created.php_version,
        status: created.status,
        detailsJson: {
          reason: "installation_created",
          wordpress
        },
        occurredAt: now,
        receivedAt: now
      });

      return created;
    }

    const previous = {
      plugin_version: existing.plugin_version ?? null,
      wp_version: existing.wp_version ?? null,
      php_version: existing.php_version ?? null,
      status: existing.status ?? null
    };
    const nextMetadata = mergeMetadata(existing.metadata_json, fields.metadataJson);
    const patch = {
      plugin_version: fields.pluginVersion ?? existing.plugin_version,
      wp_version: fields.wpVersion ?? existing.wp_version,
      php_version: fields.phpVersion ?? existing.php_version,
      status: fields.status ?? existing.status,
      last_seen_at: now,
      metadata_json: encodeJson(nextMetadata),
      updated_at: now
    };

    if (fields.lastHeartbeatAt) {
      patch.last_heartbeat_at = fields.lastHeartbeatAt;
    }
    if (fields.lastBatchReceivedAt) {
      patch.last_batch_received_at = fields.lastBatchReceivedAt;
    }
    if (fields.lastConfigFetchedAt) {
      patch.last_config_fetched_at = fields.lastConfigFetchedAt;
    }
    if (fields.lastSentAt) {
      patch.last_sent_at = fields.lastSentAt;
    }
    applyWordpressPatch(patch, wordpress, hasWordpressPayload);

    this.websiteInstallationRepository.update(existing.id, patch);
    const updated = this.websiteInstallationRepository.findByWebsiteAndInstallationId(websiteId, installationId);
    this.syncWebsiteWordpressContext(websiteId, wordpress, hasWordpressPayload, now);

    if (hasVersionChanges(previous, updated)) {
      this.websiteInstallationEventRepository.create({
        websiteId,
        installationRowId: updated.id,
        eventType: "version_changed",
        pluginVersion: updated.plugin_version,
        wpVersion: updated.wp_version,
        phpVersion: updated.php_version,
        status: updated.status,
        detailsJson: {
          previous,
          wordpress
        },
        occurredAt: now,
        receivedAt: now
      });
    }

    return updated;
  }

  syncWebsiteWordpressContext(websiteId, wordpress, hasWordpressPayload, updatedAt) {
    if (!hasWordpressPayload) {
      return;
    }

    this.websiteRepository?.updateWordpressContext?.(websiteId, {
      wpMultisiteEnabled: wordpress.multisite_enabled,
      wpNetworkId: wordpress.network_id,
      wpNetworkName: wordpress.network_name,
      wpSiteId: wordpress.site_id,
      wpSitePath: wordpress.site_path,
      updatedAt
    });
  }
}

function mergeMetadata(current, next) {
  return {
    ...decodeJson(current),
    ...(next ?? {})
  };
}

function hasVersionChanges(previous, next) {
  if (!next) {
    return false;
  }

  return previous.plugin_version !== (next.plugin_version ?? null)
    || previous.wp_version !== (next.wp_version ?? null)
    || previous.php_version !== (next.php_version ?? null)
    || previous.status !== (next.status ?? null);
}

function normalizeWordpressContext(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    multisite_enabled: normalizeBoolean(source.multisite_enabled),
    network_id: normalizeString(source.network_id),
    network_name: normalizeString(source.network_name),
    site_id: normalizeString(source.site_id),
    site_url: normalizeString(source.site_url),
    site_path: normalizeString(source.site_path)
  };
}

function normalizeString(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function applyWordpressPatch(patch, wordpress, hasWordpressPayload) {
  if (!hasWordpressPayload) {
    return;
  }

  patch.wp_multisite_enabled = wordpress.multisite_enabled ? 1 : 0;
  patch.wp_network_id = wordpress.network_id ?? null;
  patch.wp_network_name = wordpress.network_name ?? null;
  patch.wp_site_id = wordpress.site_id ?? null;
  patch.wp_site_url = wordpress.site_url ?? null;
  patch.wp_site_path = wordpress.site_path ?? null;
}
