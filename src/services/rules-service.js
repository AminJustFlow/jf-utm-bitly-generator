import { slug, title } from "../support/str.js";

export class RulesService {
  constructor(rules) {
    this.rules = rules;
    this.campaignVocabulary = buildCampaignVocabulary(rules);
    this.utmValueMaps = buildUtmValueMaps(rules);
  }

  clients() {
    return Object.keys(this.rules.clients ?? {});
  }

  channels() {
    return Object.keys(this.rules.channels ?? {});
  }

  assetTypes() {
    return this.rules.assetTypes ?? [];
  }

  normalizeClient(client, destinationUrl = null) {
    const normalized = this.normalizeByAliases(client, this.rules.clients ?? {});
    if (normalized) {
      return normalized;
    }

    if (!destinationUrl) {
      return null;
    }

    let host;
    try {
      host = new URL(destinationUrl).hostname.toLowerCase();
    } catch {
      return null;
    }

    for (const [key, clientConfig] of Object.entries(this.rules.clients ?? {})) {
      for (const domain of clientConfig.domains ?? []) {
        const normalizedDomain = String(domain).toLowerCase();
        if (host === normalizedDomain || host.endsWith(`.${normalizedDomain}`)) {
          return key;
        }
      }
    }

    return null;
  }

  normalizeChannel(channel, assetType, needsQr) {
    const normalized = this.normalizeByAliases(channel, this.rules.channels ?? {});
    if (normalized) {
      return normalized;
    }

    if (needsQr || assetType === "offline") {
      return "qr";
    }

    if (assetType && ["email", "pr"].includes(assetType)) {
      return assetType;
    }

    return null;
  }

  normalizeAssetType(assetType, channel) {
    if (assetType) {
      const normalized = String(assetType).trim().toLowerCase();
      if (this.assetTypes().includes(normalized)) {
        return normalized;
      }
    }

    if (channel) {
      return this.rules.channels?.[channel]?.assetType ?? null;
    }

    return null;
  }

  getClientDisplayName(client) {
    return this.rules.clients?.[client]?.displayName ?? title(client);
  }

  getChannelDisplayName(channel) {
    return this.rules.channels?.[channel]?.displayName ?? title(channel);
  }

  getSourceMedium(channel) {
    const defaults = this.rules.channels?.[channel]?.utmDefaults ?? null;
    if (!defaults) {
      return null;
    }

    return {
      source: defaults.source ?? null,
      medium: defaults.medium ?? null
    };
  }

  resolveUtmParameters(client, channel, parsed) {
    const channelDefaults = this.rules.channels?.[channel]?.utmDefaults ?? {};
    const clientDefaults = this.rules.clients?.[client]?.utmDefaults?.[channel] ?? {};
    const fallbackCampaign = this.buildCampaign(client, channel, parsed.campaignLabel, new Date()).canonicalCampaign;

    return {
      source: this.firstRequiredString(this.normalizeUtmField("source", parsed.utmSource), clientDefaults.source, channelDefaults.source),
      medium: this.firstRequiredString(this.normalizeUtmField("medium", parsed.utmMedium), clientDefaults.medium, channelDefaults.medium),
      campaign: this.firstRequiredString(this.normalizeUtmField("campaign", parsed.utmCampaign), clientDefaults.campaign, channelDefaults.campaign, fallbackCampaign),
      term: this.firstString(this.normalizeUtmField("term", parsed.utmTerm), clientDefaults.term, channelDefaults.term, ""),
      content: this.firstString(this.normalizeUtmField("content", parsed.utmContent), clientDefaults.content, channelDefaults.content, "")
    };
  }

  normalizeCampaignLabel(campaignLabel) {
    if (!campaignLabel || !String(campaignLabel).trim()) {
      return null;
    }

    const tokens = String(campaignLabel)
      .trim()
      .split(/[\s_-]+/u)
      .filter(Boolean)
      .map((token) => this.correctCampaignToken(token));

    return tokens.join(" ");
  }

  normalizeUtmField(field, value) {
    if (value === undefined || value === null) {
      return value ?? null;
    }

    const trimmed = String(value).trim();
    if (trimmed === "") {
      return "";
    }

    const knownValues = this.utmValueMaps[field] ?? new Map();
    const directMatch = knownValues.get(normalizeComparable(trimmed));
    if (directMatch) {
      return directMatch;
    }

    const fuzzyMatch = findBestTypoMatch(normalizeComparable(trimmed), [...knownValues.keys()]);
    if (fuzzyMatch) {
      return knownValues.get(fuzzyMatch) ?? trimmed;
    }

    if (field === "campaign") {
      return slug(this.normalizeCampaignLabel(trimmed) ?? trimmed);
    }

    return trimmed;
  }

  buildCampaign(client, channel, campaignLabel, timestamp) {
    const label = slug(campaignLabel || channel || "campaign");

    return {
      campaignLabel: label,
      canonicalCampaign: label
    };
  }

  summarizeForParser() {
    return {
      clients: this.clients().map((client) => ({
        key: client,
        aliases: this.rules.clients[client].aliases ?? [],
        utm_defaults: this.rules.clients[client].utmDefaults ?? {}
      })),
      channels: this.channels().map((channel) => ({
        key: channel,
        aliases: this.rules.channels[channel].aliases ?? [],
        asset_type: this.rules.channels[channel].assetType ?? null,
        utm_defaults: this.rules.channels[channel].utmDefaults ?? {}
      })),
      asset_types: this.assetTypes()
    };
  }

  firstRequiredString(...values) {
    for (const value of values) {
      if (value === undefined || value === null) {
        continue;
      }

      const normalized = String(value).trim();
      if (normalized !== "") {
        return normalized;
      }
    }

    return null;
  }

  firstString(...values) {
    for (const value of values) {
      if (value === undefined || value === null) {
        continue;
      }

      return String(value).trim();
    }

    return "";
  }

  correctCampaignToken(token) {
    const normalized = String(token).trim().toLowerCase();
    if (normalized.length < 4 || this.campaignVocabulary.has(normalized)) {
      return normalized;
    }

    let bestMatch = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let duplicateBest = false;

    for (const candidate of this.campaignVocabulary) {
      const distance = levenshtein(normalized, candidate);
      const maxDistance = normalized.length >= 7 ? 2 : 1;
      if (distance > maxDistance) {
        continue;
      }

      if (distance < bestDistance) {
        bestMatch = candidate;
        bestDistance = distance;
        duplicateBest = false;
        continue;
      }

      if (distance === bestDistance && candidate !== bestMatch) {
        duplicateBest = true;
      }
    }

    if (!bestMatch || duplicateBest) {
      return normalized;
    }

    return bestMatch;
  }

  normalizeByAliases(value, items) {
    if (!value || !String(value).trim()) {
      return null;
    }

    const normalized = String(value).trim().toLowerCase();
    for (const [key, config] of Object.entries(items)) {
      if (normalized === key.toLowerCase()) {
        return key;
      }

      for (const alias of config.aliases ?? []) {
        if (normalized === String(alias).toLowerCase()) {
          return key;
        }
      }
    }

    const fuzzyMatch = findBestAliasKey(value, items);
    if (fuzzyMatch) {
      return fuzzyMatch;
    }

    return null;
  }
}

function buildCampaignVocabulary(rules) {
  const vocabulary = new Set([
    "spring",
    "summer",
    "fall",
    "winter",
    "sale",
    "launch",
    "open",
    "house",
    "homepage",
    "contact",
    "ads",
    "website",
    "navigation",
    "domain",
    "dining",
    "visitation",
    "plantfinder",
    "garden",
    "plants",
    "guide",
    "flyer",
    "brochure"
  ]);

  for (const client of Object.values(rules.clients ?? {})) {
    addVocabularyTerms(vocabulary, client.displayName);
    for (const alias of client.aliases ?? []) {
      addVocabularyTerms(vocabulary, alias);
    }

    for (const defaults of Object.values(client.utmDefaults ?? {})) {
      addDefaultsVocabulary(vocabulary, defaults);
    }
  }

  for (const channel of Object.values(rules.channels ?? {})) {
    addVocabularyTerms(vocabulary, channel.displayName);
    for (const alias of channel.aliases ?? []) {
      addVocabularyTerms(vocabulary, alias);
    }

    addDefaultsVocabulary(vocabulary, channel.utmDefaults ?? {});
  }

  return vocabulary;
}

function buildUtmValueMaps(rules) {
  const fields = {
    source: new Map(),
    medium: new Map(),
    campaign: new Map(),
    term: new Map(),
    content: new Map()
  };

  for (const client of Object.values(rules.clients ?? {})) {
    for (const defaults of Object.values(client.utmDefaults ?? {})) {
      addUtmValues(fields, defaults);
    }
  }

  for (const channel of Object.values(rules.channels ?? {})) {
    addUtmValues(fields, channel.utmDefaults ?? {});
  }

  return fields;
}

function addDefaultsVocabulary(vocabulary, defaults) {
  addVocabularyTerms(vocabulary, defaults.source);
  addVocabularyTerms(vocabulary, defaults.medium);
  addVocabularyTerms(vocabulary, defaults.campaign);
  addVocabularyTerms(vocabulary, defaults.term);
  addVocabularyTerms(vocabulary, defaults.content);
}

function addVocabularyTerms(vocabulary, value) {
  if (!value || !String(value).trim()) {
    return;
  }

  const compact = slug(value);
  if (compact) {
    vocabulary.add(compact);
    for (const token of compact.split("_")) {
      if (token) {
        vocabulary.add(token);
      }
    }
  }
}

function addUtmValues(fields, defaults) {
  registerCanonical(fields.source, defaults.source);
  registerCanonical(fields.medium, defaults.medium);
  registerCanonical(fields.campaign, defaults.campaign);
  registerCanonical(fields.term, defaults.term);
  registerCanonical(fields.content, defaults.content);
}

function registerCanonical(map, value) {
  if (value === undefined || value === null) {
    return;
  }

  const trimmed = String(value).trim();
  if (trimmed === "") {
    return;
  }

  map.set(normalizeComparable(trimmed), trimmed);
}

function findBestAliasKey(value, items) {
  const candidates = [];

  for (const [key, config] of Object.entries(items ?? {})) {
    candidates.push({ key, term: key });
    for (const alias of config.aliases ?? []) {
      candidates.push({ key, term: alias });
    }
  }

  const bestTerm = findBestTypoMatch(normalizeComparable(value), candidates.map((candidate) => normalizeComparable(candidate.term)));
  if (!bestTerm) {
    return null;
  }

  return candidates.find((candidate) => normalizeComparable(candidate.term) === bestTerm)?.key ?? null;
}

function normalizeComparable(value) {
  return slug(String(value)).replace(/_/gu, "");
}

function findBestTypoMatch(input, candidates) {
  if (!input || input.length < 3) {
    return null;
  }

  let bestMatch = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let duplicateBest = false;

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const distance = levenshtein(input, candidate);
    const maxDistance = candidate.length >= 8 ? 2 : 1;
    if (distance > maxDistance) {
      continue;
    }

    if (distance < bestDistance) {
      bestMatch = candidate;
      bestDistance = distance;
      duplicateBest = false;
      continue;
    }

    if (distance === bestDistance && candidate !== bestMatch) {
      duplicateBest = true;
    }
  }

  if (!bestMatch || duplicateBest) {
    return null;
  }

  return bestMatch;
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
