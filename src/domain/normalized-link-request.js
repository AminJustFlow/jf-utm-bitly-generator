export class NormalizedLinkRequest {
  constructor({
    client,
    clientDisplayName,
    channel,
    channelDisplayName,
    assetType,
    campaignLabel,
    canonicalCampaign,
    destinationUrl,
    normalizedDestinationUrl,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    finalLongUrl,
    needsQr,
    confidence,
    warnings
  }) {
    this.client = client;
    this.clientDisplayName = clientDisplayName;
    this.channel = channel;
    this.channelDisplayName = channelDisplayName;
    this.assetType = assetType;
    this.campaignLabel = campaignLabel;
    this.canonicalCampaign = canonicalCampaign;
    this.destinationUrl = destinationUrl;
    this.normalizedDestinationUrl = normalizedDestinationUrl;
    this.utmSource = utmSource;
    this.utmMedium = utmMedium;
    this.utmCampaign = utmCampaign;
    this.utmTerm = utmTerm;
    this.utmContent = utmContent;
    this.finalLongUrl = finalLongUrl;
    this.needsQr = needsQr;
    this.confidence = confidence;
    this.warnings = warnings;
  }

  toJSON() {
    return {
      client: this.client,
      client_display_name: this.clientDisplayName,
      channel: this.channel,
      channel_display_name: this.channelDisplayName,
      asset_type: this.assetType,
      campaign_label: this.campaignLabel,
      canonical_campaign: this.canonicalCampaign,
      destination_url: this.destinationUrl,
      normalized_destination_url: this.normalizedDestinationUrl,
      utm_source: this.utmSource,
      utm_medium: this.utmMedium,
      utm_campaign: this.utmCampaign,
      utm_term: this.utmTerm,
      utm_content: this.utmContent,
      final_long_url: this.finalLongUrl,
      needs_qr: this.needsQr,
      confidence: this.confidence,
      warnings: this.warnings
    };
  }
}
