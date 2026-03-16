import { slug, title } from "../support/str.js";

const STATIC_CHANNEL_KEYS = ["facebook", "instagram", "linkedin", "email", "pr", "qr", "google_ads", "website", "domain"];

export class RulesService {
  constructor(rules) {
    this.rules = rules;
    this.sourceChannels = buildSourceChannelMap(rules);
    this.campaignVocabulary = buildCampaignVocabulary(rules);
    this.utmValueMaps = buildUtmValueMaps(rules, this.sourceChannels);
  }

  clients() {
    return Object.keys(this.rules.clients ?? {});
  }

  channels() {
    return [...new Set([
      ...Object.keys(this.rules.channels ?? {}),
      ...Object.keys(this.sourceChannels)
    ])];
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

  normalizeChannel(channel, assetType, needsQr, context = {}) {
    const normalized = this.normalizeByAliases(channel, this.rules.channels ?? {});
    if (normalized) {
      return normalized;
    }

    const sourceChannel = this.findSourceChannel(channel, context.medium);
    if (sourceChannel) {
      return sourceChannel.key;
    }

    const explicitSourceChannel = this.findSourceChannel(context.source ?? null, context.medium);
    if (explicitSourceChannel) {
      return explicitSourceChannel.key;
    }

    const inferredFromMedium = inferChannelFromMedium(context.medium, needsQr || assetType === "offline");
    if (inferredFromMedium) {
      return inferredFromMedium;
    }

    if (needsQr || assetType === "offline") {
      return "qr";
    }

    if (assetType && ["email", "pr"].includes(assetType)) {
      return assetType;
    }

    return null;
  }

  normalizeAssetType(assetType, channel, context = {}) {
    if (assetType) {
      const normalized = String(assetType).trim().toLowerCase();
      if (this.assetTypes().includes(normalized)) {
        return normalized;
      }
    }

    if (channel && this.rules.channels?.[channel]) {
      return this.rules.channels[channel].assetType ?? null;
    }

    if (channel && this.sourceChannels[channel]) {
      return this.sourceChannels[channel].assetType ?? null;
    }

    return inferAssetType(context.medium, channel, context.source);
  }

  getClientDisplayName(client) {
    return this.rules.clients?.[client]?.displayName ?? title(client);
  }

  getChannelDisplayName(channel) {
    return this.rules.channels?.[channel]?.displayName
      ?? this.sourceChannels[channel]?.displayName
      ?? title(channel);
  }

  getSourceMedium(channel) {
    const defaults = this.rules.channels?.[channel]?.utmDefaults ?? this.sourceChannels[channel]?.utmDefaults ?? null;
    if (!defaults) {
      return null;
    }

    return {
      source: defaults.source ?? null,
      medium: defaults.medium ?? null
    };
  }

  getClientTaxonomy(client) {
    const taxonomy = this.rules.clients?.[client]?.taxonomy ?? null;
    if (!taxonomy) {
      return {
        sources: [],
        mediums: [],
        campaigns: [],
        terms: [],
        contents: [],
        combinations: []
      };
    }

    return {
      sources: [...(taxonomy.sources ?? [])],
      mediums: [...(taxonomy.mediums ?? [])],
      campaigns: [...(taxonomy.campaigns ?? [])],
      terms: [...(taxonomy.terms ?? [])],
      contents: [...(taxonomy.contents ?? [])],
      combinations: [...(taxonomy.combinations ?? [])]
    };
  }

  createFormCatalog() {
    return this.clients().map((clientKey) => ({
      key: clientKey,
      displayName: this.getClientDisplayName(clientKey),
      taxonomy: normalizeFormTaxonomy(this.getClientTaxonomy(clientKey))
    }));
  }

  createChannelCatalog() {
    return Object.keys(this.rules.channels ?? {}).map((channelKey) => ({
      key: channelKey,
      displayName: this.getChannelDisplayName(channelKey),
      assetType: this.normalizeAssetType(null, channelKey, { medium: this.getSourceMedium(channelKey)?.medium ?? null }),
      requiresQr: Boolean(this.rules.channels?.[channelKey]?.requiresQr),
      utmDefaults: this.rules.channels?.[channelKey]?.utmDefaults ?? {}
    }));
  }

  resolveUtmParameters(client, channel, parsed) {
    const clientConfig = this.rules.clients?.[client] ?? {};
    const channelDefaults = this.rules.channels?.[channel]?.utmDefaults ?? this.sourceChannels[channel]?.utmDefaults ?? {};
    const clientDefaults = clientConfig.utmDefaults?.[channel] ?? {};
    const normalizedCampaignLabel = this.normalizeCampaignLabel(parsed.campaignLabel, client);
    const fallbackCampaign = this.buildCampaign(client, channel, normalizedCampaignLabel, new Date()).canonicalCampaign;

    const explicitSource = this.normalizeUtmField("source", parsed.utmSource, { client });
    const source = this.firstRequiredString(
      explicitSource,
      clientDefaults.source,
      channelDefaults.source
    );
    const explicitMedium = this.normalizeUtmField("medium", parsed.utmMedium, { client, source });
    const medium = this.firstRequiredString(
      explicitMedium,
      clientDefaults.medium,
      channelDefaults.medium
    );
    const explicitCampaign = this.normalizeUtmField("campaign", parsed.utmCampaign, { client });
    const explicitTerm = this.normalizeUtmField("term", parsed.utmTerm, { client });
    const explicitContent = this.normalizeUtmField("content", parsed.utmContent, { client });
    const taxonomyCombination = this.selectTaxonomyCombination({
      client,
      source,
      medium,
      campaignLabel: normalizedCampaignLabel,
      explicitCampaign,
      explicitTerm,
      explicitContent
    });

    return {
      source,
      medium,
      campaign: this.firstRequiredString(
        explicitCampaign,
        clientDefaults.campaign,
        taxonomyCombination?.campaign,
        channelDefaults.campaign,
        fallbackCampaign
      ),
      term: this.firstString(
        explicitTerm,
        clientDefaults.term,
        taxonomyCombination?.term,
        channelDefaults.term,
        ""
      ),
      content: this.firstString(
        explicitContent,
        clientDefaults.content,
        taxonomyCombination?.content,
        channelDefaults.content,
        ""
      )
    };
  }

  normalizeCampaignLabel(campaignLabel, client = null) {
    if (!campaignLabel || !String(campaignLabel).trim()) {
      return null;
    }

    const matched = this.matchTaxonomyValue("campaign", campaignLabel, { client });
    if (matched) {
      return matched;
    }

    const tokens = String(campaignLabel)
      .trim()
      .split(/[\s_-]+/u)
      .filter(Boolean)
      .map((token) => this.correctCampaignToken(token));

    return tokens.join(" ");
  }

  normalizeUtmField(field, value, context = {}) {
    if (value === undefined || value === null) {
      return value ?? null;
    }

    const trimmed = String(value).trim();
    if (trimmed === "") {
      return "";
    }

    const matched = this.matchTaxonomyValue(field, trimmed, context);
    if (matched) {
      return matched;
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
      return slug(this.normalizeCampaignLabel(trimmed, context.client) ?? trimmed);
    }

    return trimmed;
  }

  buildCampaign(client, channel, campaignLabel, timestamp) {
    const matched = this.matchTaxonomyValue("campaign", campaignLabel, { client });
    if (matched) {
      return {
        campaignLabel: matched,
        canonicalCampaign: matched
      };
    }

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
        utm_defaults: this.rules.clients[client].utmDefaults ?? {},
        taxonomy: this.getClientTaxonomy(client)
      })),
      channels: this.channels().map((channel) => ({
        key: channel,
        aliases: this.channelAliases(channel),
        asset_type: this.normalizeAssetType(null, channel, { medium: this.getSourceMedium(channel)?.medium ?? null }) ?? null,
        utm_defaults: this.rules.channels?.[channel]?.utmDefaults ?? this.sourceChannels[channel]?.utmDefaults ?? {}
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

  channelAliases(channel) {
    return this.rules.channels?.[channel]?.aliases
      ?? this.sourceChannels[channel]?.aliases
      ?? [];
  }

  findSourceChannel(source, medium = null) {
    const input = String(source ?? "").trim();
    if (!input) {
      return null;
    }

    const exact = Object.values(this.sourceChannels).find((definition) => {
      return definition.aliases.some((alias) => String(alias).toLowerCase() === input.toLowerCase())
        && (!medium || definition.mediums.some((candidate) => normalizeComparable(candidate) === normalizeComparable(medium)));
    });
    if (exact) {
      return exact;
    }

    const fuzzyKey = findBestAliasKey(input, this.sourceChannels);
    return fuzzyKey ? this.sourceChannels[fuzzyKey] ?? null : null;
  }

  matchTaxonomyValue(field, value, context = {}) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
      return null;
    }

    const candidates = this.taxonomyValues(field, context);
    if (candidates.length === 0) {
      return null;
    }

    const direct = candidates.find((candidate) => normalizeComparable(candidate) === normalizeComparable(normalized));
    if (direct) {
      return direct;
    }

    const fuzzy = findBestTypoMatch(normalizeComparable(normalized), candidates.map((candidate) => normalizeComparable(candidate)));
    if (!fuzzy) {
      return null;
    }

    return candidates.find((candidate) => normalizeComparable(candidate) === fuzzy) ?? null;
  }

  taxonomyValues(field, context = {}) {
    const taxonomy = context.client ? this.getClientTaxonomy(context.client) : null;
    const taxonomyMap = {
      source: taxonomy?.sources ?? [],
      medium: taxonomy?.mediums ?? [],
      campaign: taxonomy?.campaigns ?? [],
      term: taxonomy?.terms ?? [],
      content: taxonomy?.contents ?? []
    };

    const values = [...taxonomyMap[field] ?? []];

    if (field === "source") {
      Object.values(this.sourceChannels).forEach((definition) => values.push(definition.displayName));
    }

    return [...new Set(values.filter(Boolean))];
  }

  selectTaxonomyCombination({
    client,
    source,
    medium,
    campaignLabel,
    explicitCampaign,
    explicitTerm,
    explicitContent
  }) {
    const combinations = this.getClientTaxonomy(client).combinations
      .filter((entry) => {
        return normalizeComparable(entry.source) === normalizeComparable(source)
          && normalizeComparable(entry.medium) === normalizeComparable(medium);
      });

    if (combinations.length === 0) {
      return null;
    }

    const tokens = [
      { field: "campaign", value: explicitCampaign, score: 8 },
      { field: "content", value: explicitContent, score: 7 },
      { field: "term", value: explicitTerm, score: 6 },
      { field: "campaign", value: campaignLabel, score: 5 },
      { field: "content", value: campaignLabel, score: 4 },
      { field: "term", value: campaignLabel, score: 3 }
    ].filter((entry) => entry.value !== null && entry.value !== undefined && String(entry.value).trim() !== "");

    let bestCombination = null;
    let bestScore = 0;
    let duplicateBest = false;

    for (const combination of combinations) {
      let score = 0;

      for (const token of tokens) {
        if (normalizeComparable(combination[token.field]) === normalizeComparable(token.value)) {
          score += token.score;
        }
      }

      if (score > bestScore) {
        bestCombination = combination;
        bestScore = score;
        duplicateBest = false;
        continue;
      }

      if (score > 0 && score === bestScore && !sameCombination(bestCombination, combination)) {
        duplicateBest = true;
      }
    }

    if (bestScore > 0 && !duplicateBest) {
      return bestCombination;
    }

    if (combinations.length === 1) {
      return combinations[0];
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
    for (const campaign of client.taxonomy?.campaigns ?? []) {
      addVocabularyTerms(vocabulary, campaign);
    }
    for (const term of client.taxonomy?.terms ?? []) {
      addVocabularyTerms(vocabulary, term);
    }
    for (const content of client.taxonomy?.contents ?? []) {
      addVocabularyTerms(vocabulary, content);
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

function buildUtmValueMaps(rules, sourceChannels) {
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
    addTaxonomyValues(fields, client.taxonomy ?? {});
  }

  for (const channel of Object.values(rules.channels ?? {})) {
    addUtmValues(fields, channel.utmDefaults ?? {});
  }

  for (const definition of Object.values(sourceChannels)) {
    addUtmValues(fields, definition.utmDefaults ?? {});
  }

  return fields;
}

function buildSourceChannelMap(rules) {
  const grouped = new Map();

  Object.values(rules.clients ?? {}).forEach((client) => {
    (client.taxonomy?.combinations ?? []).forEach((combination) => {
      const source = String(combination.source ?? "").trim();
      const medium = String(combination.medium ?? "").trim();
      if (!source) {
        return;
      }

      const key = normalizeComparable(source);
      if (!grouped.has(key)) {
        grouped.set(key, {
          displayName: source,
          aliases: buildSourceAliases(source),
          mediums: new Set(),
          assetTypes: new Set()
        });
      }

      const entry = grouped.get(key);
      if (medium) {
        entry.mediums.add(medium);
        const assetType = inferAssetType(medium, null, source);
        if (assetType) {
          entry.assetTypes.add(assetType);
        }
      }
    });
  });

  return Object.fromEntries(
    [...grouped.entries()].map(([key, entry]) => {
      const preferredMedium = preferredValue([...entry.mediums]);
      const assetType = preferredValue([...entry.assetTypes]) ?? inferAssetType(preferredMedium, null, entry.displayName);
      return [key, {
        key,
        displayName: entry.displayName,
        aliases: [...entry.aliases],
        mediums: [...entry.mediums],
        assetType,
        utmDefaults: {
          source: entry.displayName,
          medium: preferredMedium,
          campaign: null,
          term: "",
          content: ""
        }
      }];
    })
  );
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
    compact.split("_").forEach((token) => {
      if (token) {
        vocabulary.add(token);
      }
    });
  }
}

function addTaxonomyValues(fields, taxonomy) {
  (taxonomy.sources ?? []).forEach((value) => registerCanonical(fields.source, value));
  (taxonomy.mediums ?? []).forEach((value) => registerCanonical(fields.medium, value));
  (taxonomy.campaigns ?? []).forEach((value) => registerCanonical(fields.campaign, value));
  (taxonomy.terms ?? []).forEach((value) => registerCanonical(fields.term, value));
  (taxonomy.contents ?? []).forEach((value) => registerCanonical(fields.content, value));
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

function buildSourceAliases(source) {
  const value = String(source ?? "").trim();
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .trim();

  return [...new Set([value, spaced, value.toLowerCase(), spaced.toLowerCase()])].filter(Boolean);
}

function inferChannelFromMedium(medium, needsQr) {
  const normalized = normalizeComparable(medium);
  if (needsQr || normalized === "qrcode" || normalized === "offline") {
    return "qr";
  }
  if (normalized === "email") {
    return "email";
  }
  if (normalized === "pr") {
    return "pr";
  }
  if (normalized === "website") {
    return "website";
  }
  if (normalized === "domain") {
    return "domain";
  }
  return null;
}

function inferAssetType(medium, channel, source) {
  const normalized = normalizeComparable(medium);
  if (normalized === "email") {
    return "email";
  }
  if (normalized === "qrcode" || normalized === "offline") {
    return "offline";
  }
  if (normalized === "pr") {
    return "pr";
  }
  if (normalized === "website" || normalized === "domain") {
    return "owned";
  }
  if (normalized === "cpc" || normalized === "paid") {
    return "paid";
  }
  if (normalized === "social") {
    return "social";
  }
  if (channel === "qr") {
    return "offline";
  }
  if (STATIC_CHANNEL_KEYS.includes(channel)) {
    return channel === "website" || channel === "domain"
      ? "owned"
      : channel === "email"
        ? "email"
        : channel === "pr"
          ? "pr"
          : channel === "google_ads"
            ? "paid"
            : "social";
  }

  const sourceValue = normalizeComparable(source);
  if (["constantcontact", "newsletter"].includes(sourceValue)) {
    return "email";
  }

  return null;
}

function preferredValue(values) {
  return values.filter(Boolean).sort((left, right) => left.localeCompare(right))[0] ?? null;
}

function sameCombination(left, right) {
  if (!left || !right) {
    return false;
  }

  return ["source", "medium", "campaign", "term", "content"].every((field) => {
    return normalizeComparable(left[field]) === normalizeComparable(right[field]);
  });
}

function normalizeFormTaxonomy(taxonomy) {
  return {
    sources: uniqueSortedValues(taxonomy.sources ?? []),
    mediums: uniqueSortedValues(taxonomy.mediums ?? []),
    campaigns: uniqueSortedValues(taxonomy.campaigns ?? []),
    terms: uniqueSortedValues(taxonomy.terms ?? []),
    contents: uniqueSortedValues(taxonomy.contents ?? []),
    combinations: uniqueSortedCombinations(taxonomy.combinations ?? [])
  };
}

function uniqueSortedValues(values) {
  return [...new Set(
    values
      .filter((value) => value !== undefined && value !== null)
      .map((value) => String(value))
  )].sort((left, right) => left.localeCompare(right));
}

function uniqueSortedCombinations(combinations) {
  const unique = new Map();

  combinations.forEach((combination) => {
    const normalized = {
      source: String(combination.source ?? "").trim(),
      medium: String(combination.medium ?? "").trim(),
      campaign: String(combination.campaign ?? "").trim(),
      term: String(combination.term ?? "").trim(),
      content: String(combination.content ?? "").trim()
    };
    const key = [
      normalized.source,
      normalized.medium,
      normalized.campaign,
      normalized.term,
      normalized.content
    ].map((value) => normalizeComparable(value)).join("|");

    if (!unique.has(key)) {
      unique.set(key, normalized);
    }
  });

  return [...unique.values()].sort((left, right) => {
    return [
      left.source.localeCompare(right.source),
      left.medium.localeCompare(right.medium),
      left.campaign.localeCompare(right.campaign),
      left.term.localeCompare(right.term),
      left.content.localeCompare(right.content)
    ].find((value) => value !== 0) ?? 0;
  });
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
  if (!input || input.length < 2) {
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
