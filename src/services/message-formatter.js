export class MessageFormatter {
  formatSuccess(request, result) {
    const lines = [
      `Client: ${request.clientDisplayName}`,
      `Channel: ${request.channelDisplayName}`,
      `Source: ${request.utmSource}`,
      `Medium: ${request.utmMedium}`,
      `Campaign: ${request.utmCampaign ?? request.canonicalCampaign}`,
      `Term: ${request.utmTerm === "" ? "(empty)" : request.utmTerm}`,
      `Content: ${request.utmContent === "" ? "(empty)" : request.utmContent}`,
      "",
      "UTM:",
      result.longUrl,
      "",
      "Short Link:",
      result.shortLinkAvailable ? result.shortUrl : "Unavailable right now. Bitly quota was reached, so use the full UTM link above."
    ];

    if (result.qrUrl) {
      lines.push("", "QR:", result.qrUrl);
    }

    lines.push("", "Warnings:", request.warnings.length === 0 ? "None" : request.warnings.join("; "));

    if (result.reusedExisting) {
      lines.push("", "An existing matching link was found, so I reused the current short link.");
    }

    return lines.join("\n");
  }

  formatClarification(message) {
    return message;
  }

  formatRateLimit() {
    return "Too many requests came from this user in a short window, so I skipped this one. Please wait a few minutes and try again.";
  }

  formatFailure() {
    return "I hit an internal error while generating this link. Please retry in a minute or use the strict fallback format.";
  }
}
