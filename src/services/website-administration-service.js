import { toPublicWebsite } from "./website-provisioning-service.js";

export class WebsiteAdministrationService {
  constructor({
    clientRepository,
    websiteRepository,
    websiteProvisioningService,
    conversionRepository,
    websiteInstallationRepository,
    websiteInstallationEventRepository,
    websiteCredentialEventRepository,
    websiteObservabilityEventRepository,
    websiteHealthService,
    trackingAuthService
  }) {
    this.clientRepository = clientRepository;
    this.websiteRepository = websiteRepository;
    this.websiteProvisioningService = websiteProvisioningService;
    this.conversionRepository = conversionRepository;
    this.websiteInstallationRepository = websiteInstallationRepository;
    this.websiteInstallationEventRepository = websiteInstallationEventRepository;
    this.websiteCredentialEventRepository = websiteCredentialEventRepository;
    this.websiteObservabilityEventRepository = websiteObservabilityEventRepository;
    this.websiteHealthService = websiteHealthService;
    this.trackingAuthService = trackingAuthService;
  }

  createWebsite(payload) {
    const result = this.websiteProvisioningService.createWebsite(payload);
    const website = this.websiteRepository.findById(result.website.id);
    this.recordCredentialEvent(website, "created", {
      reason: "website_provisioned"
    });

    return result;
  }

  rotateCredentials(websiteId) {
    const website = this.requireWebsite(websiteId);
    const now = new Date().toISOString();
    const credentials = this.trackingAuthService.createCredentials();
    const nextVersion = Number(website.credentials_version ?? 1) + 1;

    this.websiteRepository.updateCredentials(website.id, {
      publicKey: credentials.publicKey,
      secretKeyHash: credentials.secretKeyHash,
      secretKeyEncrypted: credentials.secretKeyEncrypted,
      credentialsVersion: nextVersion,
      lastCredentialsRotatedAt: now,
      updatedAt: now
    });

    const updated = this.websiteRepository.findById(website.id);
    this.recordCredentialEvent(updated, "rotated", {
      previous_public_key: website.public_key
    }, now);

    return {
      website: toPublicWebsite(updated),
      public_key: credentials.publicKey,
      secret_key: credentials.secretPlain
    };
  }

  updateWebsiteStatus(websiteId, nextStatus) {
    const website = this.requireWebsite(websiteId);
    if (!["active", "disabled"].includes(nextStatus)) {
      const error = new Error("Website status must be active or disabled.");
      error.code = "invalid_website_status";
      throw error;
    }

    const now = new Date().toISOString();
    this.websiteRepository.updateStatus(website.id, nextStatus, now);
    const updated = this.websiteRepository.findById(website.id);
    this.recordCredentialEvent(updated, nextStatus === "disabled" ? "disabled" : "enabled", {}, now);

    return toPublicWebsite(updated);
  }

  listClients() {
    return this.clientRepository.list().map((client) => toPublicClient(client));
  }

  listDashboardData({ referenceTime = new Date() } = {}) {
    const clients = this.clientRepository.list();
    const websites = this.websiteRepository.list();
    const installations = this.websiteInstallationRepository.listAll();
    const websiteIds = websites.map((website) => Number(website.id));
    const installationsByWebsite = groupBy(installations, "website_id");
    const lastConversionsByWebsite = groupRows(
      this.conversionRepository.listLastSubmittedByWebsiteIds(websiteIds),
      "website_id"
    );
    const recentSince = this.websiteHealthService.recentSince(referenceTime);
    const observabilitySummaries = this.websiteObservabilityEventRepository
      .summarizeByWebsiteIds(websiteIds, recentSince);
    const websiteObservability = buildWebsiteObservabilityMap(observabilitySummaries);
    const installationObservability = buildInstallationObservabilityMap(observabilitySummaries);
    const websitesByClient = new Map();
    const clientOrder = [];

    websites.forEach((website) => {
      const websiteInstallations = installationsByWebsite.get(String(website.id)) ?? [];
      const lastConversion = lastConversionsByWebsite.get(String(website.id))?.[0]?.last_conversion_at ?? null;
      const websiteObservabilitySummary = websiteObservability.get(String(website.id)) ?? emptyObservabilitySummary();
      const recentAlerts = this.websiteObservabilityEventRepository.listByWebsiteId(website.id, 8);
      const clientKey = website.client_id === null || website.client_id === undefined
        ? `name:${String(website.client_name ?? "").toLowerCase()}`
        : `id:${website.client_id}`;
      const existingGroup = websitesByClient.get(clientKey);
      const entry = {
        website: toPublicWebsite(website),
        health: this.websiteHealthService.buildWebsiteHealth({
          website,
          installations: websiteInstallations,
          lastConversionAt: lastConversion,
          authFailureCount: websiteObservabilitySummary.auth_failure.total_count,
          recentAuthFailureCount: websiteObservabilitySummary.auth_failure.recent_count,
          lastAuthFailureAt: websiteObservabilitySummary.auth_failure.last_occurred_at,
          ingestionFailureCount: websiteObservabilitySummary.ingestion_failure.total_count,
          recentIngestionFailureCount: websiteObservabilitySummary.ingestion_failure.recent_count,
          lastIngestionFailureAt: websiteObservabilitySummary.ingestion_failure.last_occurred_at,
          referenceTime
        }),
        installation_count: websiteInstallations.length,
        active_installation_count: websiteInstallations.filter((installation) => installation.status === "active").length,
        latest_installation: websiteInstallations[0] ?? null,
        installations: websiteInstallations.map((installation) => {
          const installationKey = `${website.id}:${installation.installation_id}`;
          const observability = installationObservability.get(installationKey) ?? emptyObservabilitySummary();
          return {
            ...installation,
            health: this.websiteHealthService.buildInstallationHealth({
              installation,
              authFailureCount: observability.auth_failure.total_count,
              recentAuthFailureCount: observability.auth_failure.recent_count,
              lastAuthFailureAt: observability.auth_failure.last_occurred_at,
              ingestionFailureCount: observability.ingestion_failure.total_count,
              recentIngestionFailureCount: observability.ingestion_failure.recent_count,
              lastIngestionFailureAt: observability.ingestion_failure.last_occurred_at,
              referenceTime
            })
          };
        }),
        installation_events: this.websiteInstallationEventRepository.listByWebsiteId(website.id, 12),
        credential_events: this.websiteCredentialEventRepository.listByWebsiteId(website.id, 12),
        observability_events: recentAlerts
      };

      if (existingGroup) {
        existingGroup.websites.push(entry);
        return;
      }

      websitesByClient.set(clientKey, {
        client: toPublicClient(resolveClientRecord(clients, website)),
        websites: [entry]
      });
      clientOrder.push(clientKey);
    });

    return clientOrder.map((clientKey) => {
      const group = websitesByClient.get(clientKey);
      const websiteEntries = group?.websites ?? [];

      return {
        client: group.client,
        website_count: websiteEntries.length,
        active_website_count: websiteEntries.filter((entry) => entry.website.status === "active").length,
        disabled_website_count: websiteEntries.filter((entry) => entry.website.status === "disabled").length,
        multisite_website_count: websiteEntries.filter((entry) => entry.website.wordpress.multisite_enabled).length,
        healthy_website_count: websiteEntries.filter((entry) => entry.health.status === "healthy").length,
        stale_website_count: websiteEntries.filter((entry) => entry.health.status === "stale").length,
        misconfigured_website_count: websiteEntries.filter((entry) => entry.health.status === "misconfigured").length,
        failing_website_count: websiteEntries.filter((entry) => entry.health.status === "failing").length,
        warning_website_count: websiteEntries.filter((entry) => entry.health.warnings.length > 0).length,
        auth_failure_count: websiteEntries.reduce((sum, entry) => sum + entry.health.auth_failure_count, 0),
        ingestion_failure_count: websiteEntries.reduce((sum, entry) => sum + entry.health.ingestion_failure_count, 0),
        installation_count: websiteEntries.reduce((sum, entry) => sum + entry.installation_count, 0),
        active_installation_count: websiteEntries.reduce((sum, entry) => sum + entry.active_installation_count, 0),
        websites: websiteEntries
      };
    });
  }

  healthThresholds() {
    return this.websiteHealthService.thresholds();
  }

  requireWebsite(websiteId) {
    const website = this.websiteRepository.findById(websiteId);
    if (!website) {
      const error = new Error("Website not found.");
      error.code = "website_not_found";
      throw error;
    }

    return website;
  }

  recordCredentialEvent(website, action, detailsJson = {}, createdAt = new Date().toISOString()) {
    this.websiteCredentialEventRepository.create({
      websiteId: website.id,
      action,
      publicKey: website.public_key,
      credentialsVersion: Number(website.credentials_version ?? 1),
      detailsJson,
      createdAt
    });
  }
}

function toPublicClient(client) {
  if (!client) {
    return null;
  }

  return {
    id: Number(client.id),
    client_name: client.client_name,
    status: client.status,
    created_at: client.created_at,
    updated_at: client.updated_at
  };
}

function groupBy(rows, field) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = String(row[field]);
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  });
  return grouped;
}

function groupRows(rows, field) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = String(row[field]);
    const bucket = grouped.get(key) ?? [];
    bucket.push(row);
    grouped.set(key, bucket);
  });
  return grouped;
}

function buildWebsiteObservabilityMap(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const entry = grouped.get(String(row.website_id)) ?? emptyObservabilitySummary();
    entry[row.event_type] = {
      total_count: row.total_count,
      recent_count: row.recent_count,
      last_occurred_at: row.last_occurred_at
    };
    grouped.set(String(row.website_id), entry);
  });
  return grouped;
}

function buildInstallationObservabilityMap(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    if (!row.installation_id) {
      return;
    }

    const key = `${row.website_id}:${row.installation_id}`;
    const entry = grouped.get(key) ?? emptyObservabilitySummary();
    entry[row.event_type] = {
      total_count: row.total_count,
      recent_count: row.recent_count,
      last_occurred_at: row.last_occurred_at
    };
    grouped.set(key, entry);
  });
  return grouped;
}

function emptyObservabilitySummary() {
  return {
    auth_failure: {
      total_count: 0,
      recent_count: 0,
      last_occurred_at: null
    },
    ingestion_failure: {
      total_count: 0,
      recent_count: 0,
      last_occurred_at: null
    }
  };
}

function resolveClientRecord(clients, website) {
  if (website.client_id !== null && website.client_id !== undefined) {
    const client = clients.find((row) => Number(row.id) === Number(website.client_id));
    if (client) {
      return client;
    }
  }

  return {
    id: website.client_id ?? `name:${website.client_name}`,
    client_name: website.client_name,
    status: "active",
    created_at: website.created_at,
    updated_at: website.updated_at
  };
}
