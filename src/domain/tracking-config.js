import { decodeJson, encodeJson } from "../support/json.js";

export const TRACKING_DEFAULT_CONFIG = Object.freeze({
  session_timeout_minutes: 30,
  cookie_retention_days: 90,
  track_scroll: true,
  track_outbound_clicks: true,
  track_phone_clicks: true,
  track_file_downloads: true,
  respect_consent_mode: false,
  excluded_roles: []
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
    excluded_roles: stringArray(source.excluded_roles)
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
