import { ParsedLinkRequest } from "../domain/parsed-link-request.js";

export class HeuristicParser {
  constructor(rulesService) {
    this.rulesService = rulesService;
    this.ruleSummary = this.rulesService.summarizeForParser();
  }

  parse(message) {
    const input = String(message);
    const searchableInput = input.replace(/https?:\/\/\S+/giu, " ");
    const urlMatch = input.match(/https?:\/\/\S+/iu);
    const destinationUrl = urlMatch ? urlMatch[0].replace(/[.,)]$/u, "") : null;
    const needsQr = /\b(qr|flyer|print|brochure|postcard)\b/iu.test(input);
    const clientMatch = this.findMention(searchableInput, this.ruleSummary.clients);
    const channelMatch = this.findMention(searchableInput, this.ruleSummary.channels);
    const client = this.rulesService.normalizeClient(clientMatch?.value ?? null, destinationUrl);
    const channel = this.rulesService.normalizeChannel(channelMatch?.value ?? null, channelMatch?.assetType ?? null, needsQr);
    const assetType = this.rulesService.normalizeAssetType(channelMatch?.assetType ?? null, channel);
    const campaignLabel = this.extractCampaignLabel(input, { clientMatch, channelMatch });
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
      campaign_label: campaignLabel,
      destination_url: destinationUrl,
      needs_qr: needsQr,
      confidence: this.calculateConfidence({
        message: input,
        client,
        channel,
        destinationUrl,
        campaignLabel
      }),
      warnings: ["OpenAI parsing was unavailable, so a heuristic parser was used."],
      missing_fields: missingFields
    }, "heuristic");
  }

  findMention(message, items) {
    const candidates = [];

    for (const item of items) {
      const terms = [item.key, ...(item.aliases ?? [])]
        .filter(Boolean)
        .map((value) => String(value).trim());

      for (const term of terms) {
        candidates.push({
          key: item.key,
          value: term,
          assetType: item.asset_type ?? null,
          terms,
          weight: term.length
        });
      }
    }

    candidates.sort((left, right) => right.weight - left.weight);

    for (const candidate of candidates) {
      const pattern = new RegExp(`\\b${escapeRegExp(candidate.value.replaceAll("_", " "))}\\b`, "iu");
      if (pattern.test(message)) {
        return {
          ...candidate,
          matchedText: candidate.value,
          terms: [...new Set([...(candidate.terms ?? []), candidate.value])]
        };
      }
    }

    const fuzzyMatch = this.findApproximateMention(message, candidates);
    if (fuzzyMatch) {
      return fuzzyMatch;
    }

    return null;
  }

  findApproximateMention(message, candidates) {
    const words = String(message)
      .toLowerCase()
      .match(/[a-z0-9']+/gu) ?? [];

    let bestMatch = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let duplicateBest = false;

    for (const candidate of candidates) {
      const candidateWords = String(candidate.value)
        .toLowerCase()
        .match(/[a-z0-9']+/gu) ?? [];
      if (candidateWords.length === 0) {
        continue;
      }

      const width = candidateWords.length;
      for (let index = 0; index <= words.length - width; index += 1) {
        const phrase = words.slice(index, index + width).join(" ");
        const distance = levenshtein(normalizeComparable(phrase), normalizeComparable(candidate.value));
        const maxDistance = normalizeComparable(candidate.value).length >= 8 ? 2 : 1;

        if (distance > maxDistance) {
          continue;
        }

        if (distance < bestDistance) {
          bestMatch = {
            ...candidate,
            matchedText: phrase,
            terms: [...new Set([...(candidate.terms ?? []), phrase])]
          };
          bestDistance = distance;
          duplicateBest = false;
          continue;
        }

        if (distance === bestDistance && candidate.key !== bestMatch?.key) {
          duplicateBest = true;
        }
      }
    }

    if (!bestMatch || duplicateBest) {
      return null;
    }

    return bestMatch;
  }

  extractCampaignLabel(message, matches = {}) {
    const stripped = String(message)
      .replace(/https?:\/\/\S+/giu, "")
      .replace(/\b(need|create|make|generate|build|an|a|for|to|link|tracked|utm|short|shorten|please|can|you|me|with|using|use)\b/giu, " ")
      .replace(/\s+/gu, " ")
      .trim();

    const withoutClient = this.removeTerms(stripped, matches.clientMatch?.terms ?? []);
    const withoutChannel = this.removeTerms(withoutClient, matches.channelMatch?.terms ?? []);
    const cleaned = withoutChannel
      .replace(/\b(qr|flyer|print|brochure|postcard)\b/giu, " ")
      .replace(/\s+/gu, " ")
      .trim();

    return cleaned || null;
  }

  removeTerms(message, terms) {
    return [...terms]
      .sort((left, right) => String(right).length - String(left).length)
      .reduce((result, term) => {
        return result.replace(new RegExp(`\\b${escapeRegExp(String(term).replaceAll("_", " "))}\\b`, "giu"), " ");
      }, String(message));
  }

  calculateConfidence({ message, client, channel, destinationUrl, campaignLabel }) {
    let score = 0.1;

    if (destinationUrl) {
      score += 0.32;
    }

    if (client) {
      score += 0.24;
    }

    if (channel) {
      score += 0.24;
    }

    if (campaignLabel) {
      score += 0.08;
    }

    if (/\b(link|tracked link|utm|short link|shorten|qr)\b/iu.test(message)) {
      score += 0.08;
    }

    if (/\b(need|create|make|generate|build)\b/iu.test(message)) {
      score += 0.08;
    }

    return Math.min(0.95, Number(score.toFixed(2)));
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normalizeComparable(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function levenshtein(left, right) {
  const source = [...String(left)];
  const target = [...String(right)];
  const matrix = Array.from({ length: source.length + 1 }, () => Array(target.length + 1).fill(0));

  for (let row = 0; row <= source.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= target.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= source.length; row += 1) {
    for (let column = 1; column <= target.length; column += 1) {
      const cost = source[row - 1] === target[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
    }
  }

  return matrix[source.length][target.length];
}
