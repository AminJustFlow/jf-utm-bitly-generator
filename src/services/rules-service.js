import { slug, title } from "../support/str.js";

export class RulesService {
  constructor(rules) {
    this.rules = rules;
  }

  clients() {
    return Object.keys(this.rules.clients ?? {});
  }

  channels() {
    return Object.keys(this.rules.channels ?? {});
  }

  assetTypes() {
    return this.rules.assetTypes ?? [];
  }

  normalizeClient(client, destinationUrl = null) {
    const normalized = this.normalizeByAliases(client, this.rules.clients ?? {});
    if (normalized) {
      return normalized;
    }

    if (!destinationUrl) {
      return null;
    }

    let host;
    try {
      host = new URL(destinationUrl).hostname.toLowerCase();
    } catch {
      return null;
    }

    for (const [key, clientConfig] of Object.entries(this.rules.clients ?? {})) {
      for (const domain of clientConfig.domains ?? []) {
        const normalizedDomain = String(domain).toLowerCase();
        if (host === normalizedDomain || host.endsWith(`.${normalizedDomain}`)) {
          return key;
        }
      }
    }

    return null;
  }

  normalizeChannel(channel, assetType, needsQr) {
    const normalized = this.normalizeByAliases(channel, this.rules.channels ?? {});
    if (normalized) {
      return normalized;
    }

    if (needsQr || assetType === "offline") {
      return "qr";
    }

    if (assetType && ["email", "pr"].includes(assetType)) {
      return assetType;
    }

    return null;
  }

  normalizeAssetType(assetType, channel) {
    if (assetType) {
      const normalized = String(assetType).trim().toLowerCase();
      if (this.assetTypes().includes(normalized)) {
        return normalized;
      }
    }

    if (channel) {
      return this.rules.channels?.[channel]?.assetType ?? null;
    }

    return null;
  }

  getClientDisplayName(client) {
    return this.rules.clients?.[client]?.displayName ?? title(client);
  }

  getChannelDisplayName(channel) {
    return this.rules.channels?.[channel]?.displayName ?? title(channel);
  }

  getSourceMedium(channel) {
    const channelConfig = this.rules.channels?.[channel];
    if (!channelConfig) {
      return null;
    }

    return {
      source: channelConfig.source,
      medium: channelConfig.medium
    };
  }

  buildCampaign(client, channel, campaignLabel, timestamp) {
    const label = slug(campaignLabel || channel || "campaign");

    return {
      campaignLabel: label,
      canonicalCampaign: `${client}_${formatYearMonth(timestamp)}_${label}`
    };
  }

  summarizeForParser() {
    return {
      clients: this.clients().map((client) => ({
        key: client,
        aliases: this.rules.clients[client].aliases ?? []
      })),
      channels: this.channels().map((channel) => ({
        key: channel,
        aliases: this.rules.channels[channel].aliases ?? [],
        asset_type: this.rules.channels[channel].assetType ?? null
      })),
      asset_types: this.assetTypes()
    };
  }

  normalizeByAliases(value, items) {
    if (!value || !String(value).trim()) {
      return null;
    }

    const normalized = String(value).trim().toLowerCase();
    for (const [key, config] of Object.entries(items)) {
      if (normalized === key.toLowerCase()) {
        return key;
      }

      for (const alias of config.aliases ?? []) {
        if (normalized === String(alias).toLowerCase()) {
          return key;
        }
      }
    }

    return null;
  }
}

function formatYearMonth(timestamp) {
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, "0");
  return `${year}_${month}`;
}
