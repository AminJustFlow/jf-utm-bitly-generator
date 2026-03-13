import crypto from "node:crypto";

export class FingerprintService {
  generate(normalizedRequest) {
    return crypto.createHash("sha256").update(JSON.stringify({
      client: normalizedRequest.client,
      channel: normalizedRequest.channel,
      asset_type: normalizedRequest.assetType,
      normalized_destination_url: normalizedRequest.normalizedDestinationUrl,
      utm_source: normalizedRequest.utmSource,
      utm_medium: normalizedRequest.utmMedium,
      utm_campaign: normalizedRequest.utmCampaign ?? normalizedRequest.canonicalCampaign,
      utm_term: normalizedRequest.utmTerm,
      utm_content: normalizedRequest.utmContent
    })).digest("hex");
  }
}
