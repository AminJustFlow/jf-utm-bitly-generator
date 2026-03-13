export class ParsedLinkRequest {
  constructor({
    client = null,
    channel = null,
    assetType = null,
    campaignLabel = null,
    utmSource = null,
    utmMedium = null,
    utmCampaign = null,
    utmTerm = null,
    utmContent = null,
    destinationUrl = null,
    needsQr = false,
    confidence = 0,
    warnings = [],
    missingFields = [],
    source = "openai",
    metadata = {}
  }) {
    this.client = client;
    this.channel = channel;
    this.assetType = assetType;
    this.campaignLabel = campaignLabel;
    this.utmSource = utmSource;
    this.utmMedium = utmMedium;
    this.utmCampaign = utmCampaign;
    this.utmTerm = utmTerm;
    this.utmContent = utmContent;
    this.destinationUrl = destinationUrl;
    this.needsQr = needsQr;
    this.confidence = confidence;
    this.warnings = warnings;
    this.missingFields = missingFields;
    this.source = source;
    this.metadata = metadata;
  }

  static fromObject(data = {}, source = "openai", metadata = {}) {
    return new ParsedLinkRequest({
      client: data.client ?? null,
      channel: data.channel ?? null,
      assetType: data.asset_type ?? data.assetType ?? null,
      campaignLabel: data.campaign_label ?? data.campaignLabel ?? null,
      utmSource: data.utm_source ?? data.utmSource ?? data.source ?? null,
      utmMedium: data.utm_medium ?? data.utmMedium ?? data.medium ?? null,
      utmCampaign: data.utm_campaign ?? data.utmCampaign ?? data.campaign ?? null,
      utmTerm: data.utm_term ?? data.utmTerm ?? data.term ?? null,
      utmContent: data.utm_content ?? data.utmContent ?? data.content ?? null,
      destinationUrl: data.destination_url ?? data.destinationUrl ?? null,
      needsQr: Boolean(data.needs_qr ?? data.needsQr ?? false),
      confidence: Number(data.confidence ?? 0),
      warnings: Array.isArray(data.warnings) ? data.warnings.filter((item) => typeof item === "string") : [],
      missingFields: Array.isArray(data.missing_fields) ? data.missing_fields.filter((item) => typeof item === "string") : [],
      source,
      metadata
    });
  }

  toJSON() {
    return {
      client: this.client,
      channel: this.channel,
      asset_type: this.assetType,
      campaign_label: this.campaignLabel,
      utm_source: this.utmSource,
      utm_medium: this.utmMedium,
      utm_campaign: this.utmCampaign,
      utm_term: this.utmTerm,
      utm_content: this.utmContent,
      destination_url: this.destinationUrl,
      needs_qr: this.needsQr,
      confidence: this.confidence,
      warnings: this.warnings,
      missing_fields: this.missingFields,
      source: this.source,
      metadata: this.metadata
    };
  }
}
