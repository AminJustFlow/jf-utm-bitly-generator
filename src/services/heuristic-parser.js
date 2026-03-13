import { ParsedLinkRequest } from "../domain/parsed-link-request.js";

export class HeuristicParser {
  constructor(rulesService) {
    this.rulesService = rulesService;
  }

  parse(message) {
    const urlMatch = String(message).match(/https?:\/\/\S+/iu);
    const destinationUrl = urlMatch ? urlMatch[0].replace(/[.,)]$/u, "") : null;
    const needsQr = /\b(qr|flyer|print|brochure|postcard)\b/iu.test(message);
    const client = this.rulesService.normalizeClient(this.findMention(message, this.rulesService.clients()), destinationUrl);
    const channel = this.rulesService.normalizeChannel(this.findMention(message, this.rulesService.channels()), null, needsQr);
    const assetType = this.rulesService.normalizeAssetType(null, channel);
    const missingFields = [];

    if (!client) {
      missingFields.push("client");
    }
    if (!channel) {
      missingFields.push("channel");
    }
    if (!destinationUrl) {
      missingFields.push("destination_url");
    }

    return ParsedLinkRequest.fromObject({
      client,
      channel,
      asset_type: assetType,
      campaign_label: this.extractCampaignLabel(message),
      destination_url: destinationUrl,
      needs_qr: needsQr,
      confidence: missingFields.length === 0 ? 0.66 : 0.42,
      warnings: ["OpenAI parsing was unavailable, so a heuristic parser was used."],
      missing_fields: missingFields
    }, "heuristic");
  }

  findMention(message, values) {
    for (const value of values) {
      const pattern = new RegExp(`\\b${escapeRegExp(value.replaceAll("_", " "))}\\b`, "iu");
      if (pattern.test(message)) {
        return value;
      }
    }

    return null;
  }

  extractCampaignLabel(message) {
    const stripped = String(message)
      .replace(/https?:\/\/\S+/giu, "")
      .replace(/\b(need|create|make|an|a|for|to|link|qr|instagram|facebook|linkedin|email|pr|google ads|google_ads)\b/giu, " ")
      .replace(/\s+/gu, " ")
      .trim();

    return stripped || null;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
