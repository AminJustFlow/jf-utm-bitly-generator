const DEFAULT_STATUSES = ["completed", "completed_without_short_link"];

export class UtmLibraryService {
  constructor(requestRepository) {
    this.requestRepository = requestRepository;
  }

  list(query = {}) {
    const page = positiveInteger(query.page, 1);
    const perPage = clamp(positiveInteger(query.per_page, 50), 1, 200);
    const statusFilter = normalizeFilterValue(query.status);
    const statuses = statusFilter && statusFilter !== "all"
      ? [statusFilter]
      : DEFAULT_STATUSES;

    const items = this.requestRepository
      .listUniqueTrackedRequests({ statuses })
      .map((row) => this.mapRow(row));
    const available = {
      clients: uniqueValues(items.map((item) => item.client)),
      channels: uniqueValues(items.map((item) => item.channel)),
      statuses: ["all", ...DEFAULT_STATUSES]
    };
    const filteredItems = items.filter((item) => this.matchesFilters(item, {
      client: query.client,
      channel: query.channel,
      campaign: query.campaign,
      status: statusFilter,
      search: query.search
    }));
    const total = filteredItems.length;
    const totalRequests = filteredItems.reduce((sum, item) => sum + item.requestCount, 0);
    const pageCount = Math.max(1, Math.ceil(total / perPage));
    const currentPage = Math.min(page, pageCount);
    const start = (currentPage - 1) * perPage;
    const results = filteredItems.slice(start, start + perPage);

    return {
      items: results,
      available,
      filters: {
        client: normalizeFilterValue(query.client),
        channel: normalizeFilterValue(query.channel),
        campaign: normalizeTextValue(query.campaign),
        status: statusFilter || "all",
        search: normalizeTextValue(query.search),
        perPage
      },
      pagination: {
        page: currentPage,
        perPage,
        total,
        pageCount,
        hasPreviousPage: currentPage > 1,
        hasNextPage: currentPage < pageCount
      },
      summary: {
        totalUniqueLinks: items.length,
        filteredLinks: total,
        requestsRepresented: totalRequests
      }
    };
  }

  matchesFilters(item, filters) {
    const client = normalizeFilterValue(filters.client);
    if (client && item.client !== client) {
      return false;
    }

    const channel = normalizeFilterValue(filters.channel);
    if (channel && item.channel !== channel) {
      return false;
    }

    const status = normalizeFilterValue(filters.status);
    if (status && status !== "all" && item.status !== status) {
      return false;
    }

    const campaign = normalizeTextValue(filters.campaign);
    if (campaign) {
      const haystack = [
        item.campaignLabel,
        item.canonicalCampaign,
        item.utmCampaign
      ].join(" ").toLowerCase();
      if (!haystack.includes(campaign.toLowerCase())) {
        return false;
      }
    }

    const search = normalizeTextValue(filters.search);
    if (search) {
      const haystack = [
        item.client,
        item.clientDisplayName,
        item.channel,
        item.channelDisplayName,
        item.assetType,
        item.campaignLabel,
        item.canonicalCampaign,
        item.utmSource,
        item.utmMedium,
        item.utmCampaign,
        item.utmTerm,
        item.utmContent,
        item.destinationUrl,
        item.finalLongUrl,
        item.shortUrl,
        item.originalMessage
      ].join(" ").toLowerCase();
      if (!haystack.includes(search.toLowerCase())) {
        return false;
      }
    }

    return true;
  }

  mapRow(row) {
    const normalized = safeJsonParse(row.normalized_payload);
    const warnings = safeJsonArray(row.warnings);
    const missingFields = safeJsonArray(row.missing_fields);
    const finalLongUrl = normalized.final_long_url ?? row.final_long_url ?? "";
    const extractedUtms = extractUtms(finalLongUrl);
    const client = normalized.client ?? "unknown";
    const channel = normalized.channel ?? "unknown";

    return {
      requestId: Number(row.id),
      requestUuid: row.request_uuid,
      status: String(row.status ?? "").trim().toLowerCase(),
      fingerprint: row.fingerprint ?? null,
      client,
      clientDisplayName: normalized.client_display_name ?? humanizeLabel(client),
      channel,
      channelDisplayName: normalized.channel_display_name ?? humanizeLabel(channel),
      assetType: normalized.asset_type ?? null,
      campaignLabel: normalized.campaign_label ?? null,
      canonicalCampaign: normalized.canonical_campaign ?? extractedUtms.utm_campaign ?? "",
      utmSource: normalized.utm_source ?? extractedUtms.utm_source ?? "",
      utmMedium: normalized.utm_medium ?? extractedUtms.utm_medium ?? "",
      utmCampaign: normalized.utm_campaign ?? extractedUtms.utm_campaign ?? "",
      utmTerm: normalized.utm_term ?? extractedUtms.utm_term ?? "",
      utmContent: normalized.utm_content ?? extractedUtms.utm_content ?? "",
      destinationUrl: normalized.destination_url ?? normalized.normalized_destination_url ?? "",
      normalizedDestinationUrl: normalized.normalized_destination_url ?? "",
      finalLongUrl,
      shortUrl: row.short_url ?? "",
      qrUrl: row.qr_url ?? "",
      originalMessage: row.original_message ?? "",
      warnings,
      missingFields,
      requestCount: Number(row.request_count ?? 1),
      firstCreatedAt: row.first_created_at ?? row.created_at,
      lastCreatedAt: row.last_created_at ?? row.created_at,
      reusedExisting: Number(row.reused_existing ?? 0) === 1
    };
  }
}

function safeJsonParse(value) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function safeJsonArray(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractUtms(url) {
  if (!url) {
    return {};
  }

  try {
    const parsed = new URL(url);
    return {
      utm_source: parsed.searchParams.get("utm_source") ?? "",
      utm_medium: parsed.searchParams.get("utm_medium") ?? "",
      utm_campaign: parsed.searchParams.get("utm_campaign") ?? "",
      utm_term: parsed.searchParams.get("utm_term") ?? "",
      utm_content: parsed.searchParams.get("utm_content") ?? ""
    };
  } catch {
    return {};
  }
}

function humanizeLabel(value) {
  return String(value ?? "")
    .split(/[_-]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeFilterValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeTextValue(value) {
  return String(value ?? "").trim();
}
