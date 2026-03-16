export class WebsiteHealthService {
  constructor({
    staleHours = 24,
    heartbeatGapHours = 6,
    trafficGapHours = 12,
    failureWindowHours = 24
  } = {}) {
    this.staleHours = positiveHours(staleHours, 24);
    this.heartbeatGapHours = positiveHours(heartbeatGapHours, 6);
    this.trafficGapHours = positiveHours(trafficGapHours, 12);
    this.failureWindowHours = positiveHours(failureWindowHours, 24);
  }

  thresholds() {
    return {
      stale_hours: this.staleHours,
      heartbeat_gap_hours: this.heartbeatGapHours,
      traffic_gap_hours: this.trafficGapHours,
      failure_window_hours: this.failureWindowHours
    };
  }

  recentSince(referenceTime = new Date()) {
    const now = normalizeDate(referenceTime);
    return new Date(now.getTime() - this.failureWindowHours * 60 * 60 * 1000).toISOString();
  }

  buildWebsiteHealth({
    website,
    installations = [],
    lastConversionAt = null,
    authFailureCount = 0,
    recentAuthFailureCount = 0,
    lastAuthFailureAt = null,
    ingestionFailureCount = 0,
    recentIngestionFailureCount = 0,
    lastIngestionFailureAt = null,
    referenceTime = new Date()
  }) {
    const lastHeartbeatAt = latestIso(installations.map((installation) => installation.last_heartbeat_at));
    const lastBatchAt = latestIso(installations.map((installation) => installation.last_batch_received_at));
    const lastSignalAt = latestIso([
      website?.last_seen_at ?? null,
      ...installations.map((installation) => installation.last_seen_at),
      lastHeartbeatAt,
      lastBatchAt
    ]);
    const lastConfigFetchedAt = latestIso(installations.map((installation) => installation.last_config_fetched_at));
    const warnings = buildGapWarnings({
      lastHeartbeatAt,
      lastBatchAt,
      referenceTime,
      heartbeatGapHours: this.heartbeatGapHours,
      trafficGapHours: this.trafficGapHours,
      isDisabled: normalizeStatus(website?.status) === "disabled"
    });

    if (authFailureCount > 0) {
      warnings.push({
        code: "auth_failures",
        label: `${authFailureCount} auth failure${authFailureCount === 1 ? "" : "s"}`
      });
    }
    if (ingestionFailureCount > 0) {
      warnings.push({
        code: "ingestion_failures",
        label: `${ingestionFailureCount} ingestion failure${ingestionFailureCount === 1 ? "" : "s"}`
      });
    }

    return {
      status: this.resolveStatus({
        entityStatus: website?.status,
        installationCount: installations.length,
        lastSignalAt,
        lastConfigFetchedAt,
        recentAuthFailureCount,
        recentIngestionFailureCount,
        referenceTime
      }),
      last_heartbeat_at: lastHeartbeatAt,
      last_batch_received_at: lastBatchAt,
      last_conversion_at: lastConversionAt,
      last_config_fetched_at: lastConfigFetchedAt,
      last_auth_failure_at: lastAuthFailureAt,
      last_ingestion_failure_at: lastIngestionFailureAt,
      auth_failure_count: Number(authFailureCount ?? 0),
      recent_auth_failure_count: Number(recentAuthFailureCount ?? 0),
      ingestion_failure_count: Number(ingestionFailureCount ?? 0),
      recent_ingestion_failure_count: Number(recentIngestionFailureCount ?? 0),
      warnings
    };
  }

  buildInstallationHealth({
    installation,
    authFailureCount = 0,
    recentAuthFailureCount = 0,
    lastAuthFailureAt = null,
    ingestionFailureCount = 0,
    recentIngestionFailureCount = 0,
    lastIngestionFailureAt = null,
    referenceTime = new Date()
  }) {
    const lastSignalAt = latestIso([
      installation?.last_seen_at ?? null,
      installation?.last_heartbeat_at ?? null,
      installation?.last_batch_received_at ?? null
    ]);
    const warnings = buildGapWarnings({
      lastHeartbeatAt: installation?.last_heartbeat_at ?? null,
      lastBatchAt: installation?.last_batch_received_at ?? null,
      referenceTime,
      heartbeatGapHours: this.heartbeatGapHours,
      trafficGapHours: this.trafficGapHours,
      isDisabled: normalizeStatus(installation?.status) === "disabled"
    });

    return {
      status: this.resolveStatus({
        entityStatus: installation?.status,
        installationCount: 1,
        lastSignalAt,
        lastConfigFetchedAt: installation?.last_config_fetched_at ?? null,
        recentAuthFailureCount,
        recentIngestionFailureCount,
        referenceTime
      }),
      auth_failure_count: Number(authFailureCount ?? 0),
      recent_auth_failure_count: Number(recentAuthFailureCount ?? 0),
      last_auth_failure_at: lastAuthFailureAt,
      ingestion_failure_count: Number(ingestionFailureCount ?? 0),
      recent_ingestion_failure_count: Number(recentIngestionFailureCount ?? 0),
      last_ingestion_failure_at: lastIngestionFailureAt,
      warnings
    };
  }

  resolveStatus({
    entityStatus,
    installationCount,
    lastSignalAt,
    lastConfigFetchedAt,
    recentAuthFailureCount,
    recentIngestionFailureCount,
    referenceTime
  }) {
    const normalizedStatus = normalizeStatus(entityStatus);
    if (normalizedStatus === "disabled") {
      return "disabled";
    }
    if (recentIngestionFailureCount > 0 || ["error", "failed", "failing", "unhealthy"].includes(normalizedStatus)) {
      return "failing";
    }
    if (recentAuthFailureCount > 0 || Number(installationCount ?? 0) === 0) {
      return "misconfigured";
    }
    if (isStale(lastSignalAt, referenceTime, this.staleHours)) {
      return "stale";
    }
    if (!lastConfigFetchedAt) {
      return "warning";
    }
    return "healthy";
  }
}

function buildGapWarnings({
  lastHeartbeatAt,
  lastBatchAt,
  referenceTime,
  heartbeatGapHours,
  trafficGapHours,
  isDisabled
}) {
  if (isDisabled) {
    return [];
  }

  const warnings = [];
  if (isStale(lastHeartbeatAt, referenceTime, heartbeatGapHours)) {
    warnings.push({
      code: "heartbeat_gap",
      label: "Heartbeat gap"
    });
  }
  if (isStale(lastBatchAt, referenceTime, trafficGapHours)) {
    warnings.push({
      code: "traffic_gap",
      label: "Traffic gap"
    });
  }

  return warnings;
}

function isStale(value, referenceTime, thresholdHours) {
  const target = Date.parse(String(value ?? ""));
  const reference = normalizeDate(referenceTime).getTime();
  if (Number.isNaN(target)) {
    return true;
  }

  return reference - target >= thresholdHours * 60 * 60 * 1000;
}

function latestIso(values) {
  const normalized = values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .sort((left, right) => Date.parse(right) - Date.parse(left));

  return normalized[0] ?? null;
}

function normalizeDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase();
}

function positiveHours(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
