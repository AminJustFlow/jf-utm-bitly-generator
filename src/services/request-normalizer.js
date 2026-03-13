import { NormalizedLinkRequest } from "../domain/normalized-link-request.js";
import { WorkflowDecision } from "../domain/workflow-decision.js";

export class RequestNormalizer {
  constructor(rulesService, urlService, confidenceThreshold) {
    this.rulesService = rulesService;
    this.urlService = urlService;
    this.confidenceThreshold = confidenceThreshold;
  }

  normalize(parsed) {
    const warnings = [...parsed.warnings];
    const missingFields = [...parsed.missingFields];

    let normalizedDestination = null;
    if (!parsed.destinationUrl) {
      missingFields.push("destination_url");
    } else {
      try {
        normalizedDestination = this.urlService.normalizeDestination(parsed.destinationUrl);
      } catch {
        warnings.push("The destination URL was not a valid absolute URL.");
        missingFields.push("destination_url");
      }
    }

    const client = this.rulesService.normalizeClient(parsed.client, normalizedDestination);
    if (!client) {
      missingFields.push("client");
    }

    const channel = this.rulesService.normalizeChannel(parsed.channel, parsed.assetType, parsed.needsQr);
    if (!channel) {
      missingFields.push("channel");
    }

    const assetType = this.rulesService.normalizeAssetType(parsed.assetType, channel);
    if (!assetType) {
      missingFields.push("asset_type");
    }

    const uniqueMissing = [...new Set(missingFields.filter(Boolean))];
    const uniqueWarnings = [...new Set(warnings.filter(Boolean))];

    if (!client || !channel || !assetType || !normalizedDestination || parsed.confidence < this.confidenceThreshold) {
      return new WorkflowDecision({
        status: "clarify",
        warnings: uniqueWarnings,
        missingFields: uniqueMissing,
        message: this.buildClarificationMessage(uniqueMissing, parsed.confidence)
      });
    }

    const campaign = this.rulesService.buildCampaign(client, channel, parsed.campaignLabel, new Date());
    const sourceMedium = this.rulesService.getSourceMedium(channel);

    if (!sourceMedium) {
      return new WorkflowDecision({
        status: "clarify",
        warnings: uniqueWarnings,
        missingFields: ["channel"],
        message: `I could not map that channel to a supported source/medium pair. Please reply with one of: ${this.rulesService.channels().join(", ")}.`
      });
    }

    const finalLongUrl = this.urlService.appendUtms(normalizedDestination, {
      utm_source: sourceMedium.source,
      utm_medium: sourceMedium.medium,
      utm_campaign: campaign.canonicalCampaign
    });

    return new WorkflowDecision({
      status: "ready",
      warnings: uniqueWarnings,
      missingFields: [],
      normalizedRequest: new NormalizedLinkRequest({
        client,
        clientDisplayName: this.rulesService.getClientDisplayName(client),
        channel,
        channelDisplayName: this.rulesService.getChannelDisplayName(channel),
        assetType,
        campaignLabel: campaign.campaignLabel,
        canonicalCampaign: campaign.canonicalCampaign,
        destinationUrl: parsed.destinationUrl,
        normalizedDestinationUrl: normalizedDestination,
        utmSource: sourceMedium.source,
        utmMedium: sourceMedium.medium,
        finalLongUrl,
        needsQr: parsed.needsQr || channel === "qr",
        confidence: parsed.confidence,
        warnings: uniqueWarnings
      })
    });
  }

  buildClarificationMessage(missingFields, confidence) {
    if (missingFields.includes("channel")) {
      return `I found the URL and likely client, but I could not confidently identify the channel. Please reply with one of: ${this.rulesService.channels().join(", ")}.`;
    }

    if (missingFields.includes("client")) {
      return `I need the client before I can generate the link. Please reply with one of: ${this.rulesService.clients().join(", ")}.`;
    }

    if (missingFields.includes("destination_url")) {
      return "I could not find a valid destination URL. Please reply with the full https:// URL you want tracked.";
    }

    if (confidence < this.confidenceThreshold) {
      return "I was not confident enough to generate a tracked link from that message. Please restate it or use: link | client=studleys | channel=instagram | campaign=spring-sale | url=https://studleys.com/perennials";
    }

    return "I need a bit more detail before generating this link.";
  }
}
