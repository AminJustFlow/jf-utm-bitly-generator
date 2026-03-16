import { decodeJson, encodeJson } from "../support/json.js";

export const TRACKING_DEFAULT_FUNNELS = Object.freeze([
  Object.freeze({
    key: "lead_journey",
    label: "Lead Journey",
    steps: Object.freeze([
      Object.freeze({ key: "sessions", label: "Sessions", type: "session" }),
      Object.freeze({ key: "engaged_sessions", label: "Engaged Sessions", type: "engaged_session" }),
      Object.freeze({ key: "form_submits", label: "Form Submit Sessions", type: "event", event_type: "form_submit" }),
      Object.freeze({ key: "conversions", label: "Conversion Sessions", type: "conversion" })
    ])
  })
]);

export const TRACKING_DEFAULT_CONFIG = Object.freeze({
  session_timeout_minutes: 30,
  cookie_retention_days: 90,
  track_scroll: true,
  track_outbound_clicks: true,
  track_phone_clicks: true,
  track_file_downloads: true,
  respect_consent_mode: false,
  excluded_roles: [],
  reporting_funnels: TRACKING_DEFAULT_FUNNELS
});

export function normalizeTrackingConfig(config) {
  const source = normalizeConfigSource(config);

  return {
    session_timeout_minutes: positiveInteger(source.session_timeout_minutes, TRACKING_DEFAULT_CONFIG.session_timeout_minutes),
    cookie_retention_days: positiveInteger(source.cookie_retention_days, TRACKING_DEFAULT_CONFIG.cookie_retention_days),
    track_scroll: booleanValue(source.track_scroll, TRACKING_DEFAULT_CONFIG.track_scroll),
    track_outbound_clicks: booleanValue(source.track_outbound_clicks, TRACKING_DEFAULT_CONFIG.track_outbound_clicks),
    track_phone_clicks: booleanValue(source.track_phone_clicks, TRACKING_DEFAULT_CONFIG.track_phone_clicks),
    track_file_downloads: booleanValue(source.track_file_downloads, TRACKING_DEFAULT_CONFIG.track_file_downloads),
    respect_consent_mode: booleanValue(source.respect_consent_mode, TRACKING_DEFAULT_CONFIG.respect_consent_mode),
    excluded_roles: stringArray(source.excluded_roles),
    reporting_funnels: normalizeReportingFunnels(source.reporting_funnels)
  };
}

export function serializeTrackingConfig(config) {
  return encodeJson(normalizeTrackingConfig(config));
}

function normalizeConfigSource(config) {
  if (typeof config === "string") {
    const parsed = decodeJson(config);
    return isPlainObject(parsed) ? parsed : {};
  }

  return isPlainObject(config) ? config : {};
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanValue(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function stringArray(value) {
  if (!Array.isArray(value)) {
    return [...TRACKING_DEFAULT_CONFIG.excluded_roles];
  }

  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeReportingFunnels(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return cloneDefaultFunnels();
  }

  const normalized = value
    .map((funnel, index) => normalizeFunnel(funnel, index))
    .filter(Boolean);

  return normalized.length > 0 ? normalized : cloneDefaultFunnels();
}

function normalizeFunnel(funnel, index) {
  if (!isPlainObject(funnel)) {
    return null;
  }

  const key = normalizeToken(funnel.key) || `funnel_${index + 1}`;
  const label = normalizeLabel(funnel.label) || `Funnel ${index + 1}`;
  const steps = normalizeFunnelSteps(funnel.steps);
  if (steps.length === 0) {
    return null;
  }

  return {
    key,
    label,
    steps
  };
}

function normalizeFunnelSteps(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((step, index) => normalizeFunnelStep(step, index))
    .filter(Boolean);
}

function normalizeFunnelStep(step, index) {
  if (!isPlainObject(step)) {
    return null;
  }

  const type = normalizeToken(step.type);
  if (!["session", "engaged_session", "page", "event", "conversion"].includes(type)) {
    return null;
  }

  return {
    key: normalizeToken(step.key) || `${type}_${index + 1}`,
    label: normalizeLabel(step.label) || `Step ${index + 1}`,
    type,
    page_path: normalizeLabel(step.page_path),
    page_path_prefix: normalizeLabel(step.page_path_prefix),
    page_url_contains: normalizeLabel(step.page_url_contains),
    event_type: normalizeToken(step.event_type),
    event_name: normalizeLabel(step.event_name),
    conversion_type: normalizeToken(step.conversion_type)
  };
}

function normalizeToken(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLabel(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function cloneDefaultFunnels() {
  return TRACKING_DEFAULT_FUNNELS.map((funnel) => ({
    key: funnel.key,
    label: funnel.label,
    steps: funnel.steps.map((step) => ({
      ...step
    }))
  }));
}
