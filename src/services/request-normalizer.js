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
    const correctedCampaignLabel = this.rulesService.normalizeCampaignLabel(parsed.campaignLabel);

    if (correctedCampaignLabel && parsed.campaignLabel && correctedCampaignLabel !== String(parsed.campaignLabel).trim().toLowerCase()) {
      warnings.push(`Campaign label corrected to "${correctedCampaignLabel}".`);
    }

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

    const parsedForResolution = {
      ...parsed,
      campaignLabel: correctedCampaignLabel
    };
    const utm = this.rulesService.resolveUtmParameters(client, channel, parsedForResolution);
    const effectiveWarnings = this.removeResolvedUtmWarnings(uniqueWarnings, utm);
    const effectiveMissingFields = this.removeResolvedUtmMissingFields(uniqueMissing, utm);
    if (!utm.source || !utm.medium || !utm.campaign) {
      return new WorkflowDecision({
        status: "clarify",
        warnings: effectiveWarnings,
        missingFields: ["utm_source", "utm_medium", "utm_campaign"],
        message: "I could not resolve the full UTM set for that request. Please restate it or provide explicit source, medium, and campaign values."
      });
    }

    const finalLongUrl = this.urlService.appendUtms(normalizedDestination, {
      utm_source: utm.source,
      utm_medium: utm.medium,
      utm_campaign: utm.campaign,
      utm_term: utm.term,
      utm_content: utm.content
    });

    return new WorkflowDecision({
      status: "ready",
      warnings: effectiveWarnings,
      missingFields: effectiveMissingFields,
      normalizedRequest: new NormalizedLinkRequest({
        client,
        clientDisplayName: this.rulesService.getClientDisplayName(client),
        channel,
        channelDisplayName: this.rulesService.getChannelDisplayName(channel),
        assetType,
        campaignLabel: correctedCampaignLabel ?? utm.campaign,
        canonicalCampaign: utm.campaign,
        destinationUrl: parsed.destinationUrl,
        normalizedDestinationUrl: normalizedDestination,
        utmSource: utm.source,
        utmMedium: utm.medium,
        utmCampaign: utm.campaign,
        utmTerm: utm.term,
        utmContent: utm.content,
        finalLongUrl,
        needsQr: parsed.needsQr || channel === "qr",
        confidence: parsed.confidence,
        warnings: effectiveWarnings
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
      return "I was not confident enough to generate a tracked link from that message. Please restate it or use: link | client=studleys | channel=instagram | campaign=SpringSale | url=https://studleys.com/perennials";
    }

    return "I need a bit more detail before generating this link.";
  }

  removeResolvedUtmWarnings(warnings, utm) {
    if (!utm.source && !utm.medium && !utm.campaign) {
      return warnings;
    }

    return warnings.filter((warning) => !/^utm_(source|medium|campaign|term|content)\s+not specified, left null$/iu.test(warning));
  }

  removeResolvedUtmMissingFields(missingFields, utm) {
    const resolved = new Set();

    if (utm.source) {
      resolved.add("utm_source");
    }
    if (utm.medium) {
      resolved.add("utm_medium");
    }
    if (utm.campaign) {
      resolved.add("utm_campaign");
    }
    if (utm.term !== null && utm.term !== undefined) {
      resolved.add("utm_term");
    }
    if (utm.content !== null && utm.content !== undefined) {
      resolved.add("utm_content");
    }

    return missingFields.filter((field) => !resolved.has(field));
  }
}
