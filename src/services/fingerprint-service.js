import crypto from "node:crypto";

export class FingerprintService {
  generate(normalizedRequest) {
    return crypto.createHash("sha256").update(JSON.stringify({
      client: normalizedRequest.client,
      channel: normalizedRequest.channel,
      asset_type: normalizedRequest.assetType,
      normalized_destination_url: normalizedRequest.normalizedDestinationUrl,
      canonical_campaign: normalizedRequest.canonicalCampaign
    })).digest("hex");
  }
}
