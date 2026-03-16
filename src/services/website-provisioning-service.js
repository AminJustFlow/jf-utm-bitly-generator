import { normalizeTrackingConfig } from "../domain/tracking-config.js";

export class WebsiteProvisioningService {
  constructor({
    clientRepository,
    websiteRepository,
    trackingAuthService
  }) {
    this.clientRepository = clientRepository;
    this.websiteRepository = websiteRepository;
    this.trackingAuthService = trackingAuthService;
  }

  createWebsite(payload) {
    const now = new Date().toISOString();
    const credentials = this.trackingAuthService.createCredentials();
    const config = normalizeTrackingConfig(payload.config_json);
    const client = this.resolveClient(payload.client_name, now);
    const wordpress = normalizeWordpressContext(payload.wordpress);
    const websiteId = this.websiteRepository.create({
      clientId: client.id,
      clientName: payload.client_name,
      websiteName: payload.website_name,
      baseUrl: normalizeBaseUrl(payload.base_url),
      platformType: payload.platform_type ?? "wordpress",
      environment: payload.environment ?? "production",
      status: payload.status ?? "active",
      publicKey: credentials.publicKey,
      secretKeyHash: credentials.secretKeyHash,
      secretKeyEncrypted: credentials.secretKeyEncrypted,
      configVersion: 1,
      configJson: config,
      wpMultisiteEnabled: wordpress.multisite_enabled,
      wpNetworkId: wordpress.network_id,
      wpNetworkName: wordpress.network_name,
      wpSiteId: wordpress.site_id,
      wpSitePath: wordpress.site_path,
      createdAt: now,
      updatedAt: now
    });
    const website = this.websiteRepository.findById(websiteId);

    return {
      website: toPublicWebsite(website),
      public_key: credentials.publicKey,
      secret_key: credentials.secretPlain
    };
  }

  resolveClient(clientName, now) {
    const normalizedName = String(clientName ?? "").trim();
    let client = this.clientRepository.findByName(normalizedName);
    if (client) {
      return client;
    }

    const clientId = this.clientRepository.create({
      clientName: normalizedName,
      createdAt: now,
      updatedAt: now
    });
    if (clientId) {
      client = this.clientRepository.findById(clientId);
    }

    client = client ?? this.clientRepository.findByName(normalizedName);
    if (!client) {
      throw new Error(`Unable to resolve client "${normalizedName}".`);
    }

    return client;
  }
}

export function toPublicWebsite(website) {
  if (!website) {
    return null;
  }

  return {
    id: Number(website.id),
    client_id: website.client_id === null || website.client_id === undefined ? null : Number(website.client_id),
    client_name: website.client_name,
    website_name: website.website_name,
    base_url: website.base_url,
    platform_type: website.platform_type,
    environment: website.environment,
    status: website.status,
    public_key: website.public_key,
    credentials_version: Number(website.credentials_version ?? 1),
    last_credentials_rotated_at: website.last_credentials_rotated_at ?? null,
    config_version: Number(website.config_version ?? 1),
    config_json: normalizeTrackingConfig(website.config_json),
    installed_plugin_version: website.installed_plugin_version ?? null,
    wordpress: normalizeWordpressContext({
      multisite_enabled: website.wp_multisite_enabled,
      network_id: website.wp_network_id,
      network_name: website.wp_network_name,
      site_id: website.wp_site_id,
      site_path: website.wp_site_path
    }),
    created_at: website.created_at,
    updated_at: website.updated_at,
    last_seen_at: website.last_seen_at ?? null
  };
}

function normalizeBaseUrl(value) {
  const url = new URL(String(value ?? "").trim());
  const pathname = url.pathname === "/"
    ? ""
    : url.pathname.replace(/\/+$/u, "");

  return `${url.origin}${pathname}`;
}

function normalizeWordpressContext(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    multisite_enabled: normalizeBoolean(source.multisite_enabled),
    network_id: normalizeString(source.network_id),
    network_name: normalizeString(source.network_name),
    site_id: normalizeString(source.site_id),
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
