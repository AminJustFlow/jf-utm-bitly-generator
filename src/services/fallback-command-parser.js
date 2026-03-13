import { ParsedLinkRequest } from "../domain/parsed-link-request.js";
import { bool } from "../support/str.js";

export class FallbackCommandParser {
  parse(message) {
    const trimmed = String(message).trim();
    if (!/^link\s*\|/iu.test(trimmed)) {
      return null;
    }

    const values = {};
    for (const segment of trimmed.split("|")) {
      if (!segment.includes("=")) {
        continue;
      }

      const index = segment.indexOf("=");
      const key = segment.slice(0, index).trim().toLowerCase();
      const value = segment.slice(index + 1).trim();
      values[key] = value;
    }

    return ParsedLinkRequest.fromObject({
      client: values.client ?? null,
      channel: values.channel ?? null,
      asset_type: values.asset_type ?? values.asset ?? null,
      campaign_label: values.campaign ?? values.campaign_label ?? null,
      destination_url: values.url ?? values.destination_url ?? null,
      needs_qr: bool(values.qr ?? null) || values.channel === "qr",
      confidence: 1,
      warnings: [],
      missing_fields: []
    }, "command");
  }
}
