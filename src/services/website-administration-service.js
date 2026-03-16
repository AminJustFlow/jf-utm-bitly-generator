import { toPublicWebsite } from "./website-provisioning-service.js";

export class WebsiteAdministrationService {
  constructor({
    clientRepository,
    websiteRepository,
    websiteProvisioningService,
    websiteInstallationRepository,
    websiteInstallationEventRepository,
    websiteCredentialEventRepository,
    trackingAuthService
  }) {
    this.clientRepository = clientRepository;
    this.websiteRepository = websiteRepository;
    this.websiteProvisioningService = websiteProvisioningService;
    this.websiteInstallationRepository = websiteInstallationRepository;
    this.websiteInstallationEventRepository = websiteInstallationEventRepository;
    this.websiteCredentialEventRepository = websiteCredentialEventRepository;
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

  listDashboardData() {
    const clients = this.clientRepository.list();
    const websites = this.websiteRepository.list();
    const installations = this.websiteInstallationRepository.listAll();
    const installationsByWebsite = groupBy(installations, "website_id");
    const websitesByClient = new Map();
    const clientOrder = [];

    websites.forEach((website) => {
      const websiteInstallations = installationsByWebsite.get(String(website.id)) ?? [];
      const clientKey = website.client_id === null || website.client_id === undefined
        ? `name:${String(website.client_name ?? "").toLowerCase()}`
        : `id:${website.client_id}`;
      const existingGroup = websitesByClient.get(clientKey);
      const entry = {
        website: toPublicWebsite(website),
        installation_count: websiteInstallations.length,
        active_installation_count: websiteInstallations.filter((installation) => installation.status === "active").length,
        latest_installation: websiteInstallations[0] ?? null,
        installations: websiteInstallations,
        installation_events: this.websiteInstallationEventRepository.listByWebsiteId(website.id, 12),
        credential_events: this.websiteCredentialEventRepository.listByWebsiteId(website.id, 12)
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
        installation_count: websiteEntries.reduce((sum, entry) => sum + entry.installation_count, 0),
        active_installation_count: websiteEntries.reduce((sum, entry) => sum + entry.active_installation_count, 0),
        websites: websiteEntries
      };
    });
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
