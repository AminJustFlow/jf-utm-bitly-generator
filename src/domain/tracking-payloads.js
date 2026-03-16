const TRACKING_EVENT_TYPES = new Set([
  "page_view",
  "click",
  "scroll",
  "outbound_click",
  "phone_click",
  "file_download",
  "session_start",
  "session_end",
  "form_submit",
  "conversion",
  "consent_update",
  "lead_identified",
  "custom"
]);

export function validateTrackingBatchPayload(payload) {
  if (!isPlainObject(payload)) {
    return invalid("invalid_payload", "Expected a JSON object payload.");
  }

  const events = payload.events;
  if (!Array.isArray(events)) {
    return invalid("invalid_events", "Expected events to be an array.");
  }

  const normalizedEvents = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = normalizeTrackingEvent(events[index], index);
    if (!event.ok) {
      return event;
    }

    normalizedEvents.push(event.value);
  }

  const installationId = requiredString(payload.installation_id, "installation_id");
  if (!installationId.ok) {
    return installationId;
  }

  const pluginVersion = requiredString(payload.plugin_version, "plugin_version");
  if (!pluginVersion.ok) {
    return pluginVersion;
  }

  const sentAt = requiredIsoTimestamp(payload.sent_at, "sent_at");
  if (!sentAt.ok) {
    return sentAt;
  }

  const wordpress = normalizeOptionalWordpressContext(payload.wordpress, "wordpress");
  if (!wordpress.ok) {
    return wordpress;
  }

  return {
    ok: true,
    value: {
      installation_id: installationId.value,
      plugin_version: pluginVersion.value,
      sent_at: sentAt.value,
      events: normalizedEvents,
      wordpress: wordpress.value
    }
  };
}

export function validatePluginHeartbeatPayload(payload) {
  if (!isPlainObject(payload)) {
    return invalid("invalid_payload", "Expected a JSON object payload.");
  }

  const installationId = requiredString(payload.installation_id, "installation_id");
  if (!installationId.ok) {
    return installationId;
  }

  const pluginVersion = requiredString(payload.plugin_version, "plugin_version");
  if (!pluginVersion.ok) {
    return pluginVersion;
  }

  const wordpressVersion = requiredString(payload.wp_version, "wp_version");
  if (!wordpressVersion.ok) {
    return wordpressVersion;
  }

  const phpVersion = requiredString(payload.php_version, "php_version");
  if (!phpVersion.ok) {
    return phpVersion;
  }

  const status = requiredString(payload.status, "status");
  if (!status.ok) {
    return status;
  }

  const wordpress = normalizeOptionalWordpressContext(payload.wordpress, "wordpress");
  if (!wordpress.ok) {
    return wordpress;
  }

  return {
    ok: true,
    value: {
      installation_id: installationId.value,
      plugin_version: pluginVersion.value,
      wp_version: wordpressVersion.value,
      php_version: phpVersion.value,
      status: status.value,
      wordpress: wordpress.value
    }
  };
}

export function validateWebsiteRegistrationPayload(payload) {
  if (!isPlainObject(payload)) {
    return invalid("invalid_payload", "Expected a JSON object payload.");
  }

  const clientName = requiredString(payload.client_name, "client_name");
  if (!clientName.ok) {
    return clientName;
  }

  const websiteName = requiredString(payload.website_name, "website_name");
  if (!websiteName.ok) {
    return websiteName;
  }

  const baseUrl = requiredString(payload.base_url, "base_url");
  if (!baseUrl.ok) {
    return baseUrl;
  }

  if (payload.config_json !== undefined && !isPlainObject(payload.config_json)) {
    return invalid("invalid_config_json", "config_json must be an object when provided.");
  }

  const wordpress = normalizeOptionalWordpressContext(payload.wordpress, "wordpress");
  if (!wordpress.ok) {
    return wordpress;
  }

  return {
    ok: true,
    value: {
      client_name: clientName.value,
      website_name: websiteName.value,
      base_url: baseUrl.value,
      platform_type: optionalString(payload.platform_type),
      environment: optionalString(payload.environment),
      status: optionalString(payload.status),
      config_json: payload.config_json ?? {},
      wordpress: wordpress.value
    }
  };
}

function normalizeTrackingEvent(event, index) {
  if (!isPlainObject(event)) {
    return invalid("invalid_event", `Event at index ${index} must be an object.`);
  }

  const eventUuid = requiredString(event.event_uuid, `events[${index}].event_uuid`);
  if (!eventUuid.ok) {
    return eventUuid;
  }

  const eventType = requiredString(event.event_type, `events[${index}].event_type`);
  if (!eventType.ok) {
    return eventType;
  }

  if (!TRACKING_EVENT_TYPES.has(eventType.value)) {
    return invalid(
      "invalid_event_type",
      `events[${index}].event_type must be one of: ${[...TRACKING_EVENT_TYPES].join(", ")}.`
    );
  }

  const occurredAt = requiredIsoTimestamp(event.occurred_at, `events[${index}].occurred_at`);
  if (!occurredAt.ok) {
    return occurredAt;
  }

  const visitorId = requiredString(event.visitor_id, `events[${index}].visitor_id`);
  if (!visitorId.ok) {
    return visitorId;
  }

  const sessionId = requiredString(event.session_id, `events[${index}].session_id`);
  if (!sessionId.ok) {
    return sessionId;
  }

  const utm = normalizeObject(event.utm, `events[${index}].utm`);
  if (!utm.ok) {
    return utm;
  }

  const clickIds = normalizeObject(event.click_ids, `events[${index}].click_ids`);
  if (!clickIds.ok) {
    return clickIds;
  }

  const meta = normalizeObject(event.meta, `events[${index}].meta`);
  if (!meta.ok) {
    return meta;
  }

  const consent = normalizeObject(event.consent, `events[${index}].consent`);
  if (!consent.ok) {
    return consent;
  }

  return {
    ok: true,
    value: {
      event_uuid: eventUuid.value,
      event_type: eventType.value,
      event_name: optionalString(event.event_name),
      occurred_at: occurredAt.value,
      visitor_id: visitorId.value,
      session_id: sessionId.value,
      page_url: optionalString(event.page_url),
      page_path: optionalString(event.page_path),
      referrer_url: optionalString(event.referrer_url),
      utm: {
        source: optionalString(utm.value.source),
        medium: optionalString(utm.value.medium),
        campaign: optionalString(utm.value.campaign),
        term: optionalString(utm.value.term),
        content: optionalString(utm.value.content)
      },
      click_ids: {
        gclid: optionalString(clickIds.value.gclid),
        fbclid: optionalString(clickIds.value.fbclid),
        msclkid: optionalString(clickIds.value.msclkid),
        ttclid: optionalString(clickIds.value.ttclid)
      },
      consent: normalizeConsent(consent.value),
      meta: meta.value
    }
  };
}

function requiredString(value, field) {
  const normalized = optionalString(value);
  if (!normalized) {
    return invalid("missing_field", `Missing required field: ${field}.`);
  }

  return {
    ok: true,
    value: normalized
  };
}

function requiredIsoTimestamp(value, field) {
  const normalized = optionalString(value);
  if (!normalized) {
    return invalid("missing_field", `Missing required field: ${field}.`);
  }

  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    return invalid("invalid_timestamp", `${field} must be a valid ISO timestamp.`);
  }

  return {
    ok: true,
    value: new Date(parsed).toISOString()
  };
}

function normalizeObject(value, field) {
  if (value === undefined || value === null) {
    return {
      ok: true,
      value: {}
    };
  }

  if (!isPlainObject(value)) {
    return invalid("invalid_field", `${field} must be an object when provided.`);
  }

  return {
    ok: true,
    value
  };
}

function optionalString(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalWordpressContext(value, field) {
  if (value === undefined || value === null) {
    return {
      ok: true,
      value: null
    };
  }

  if (!isPlainObject(value)) {
    return invalid("invalid_field", `${field} must be an object when provided.`);
  }

  const multisiteEnabled = optionalBoolean(value.multisite_enabled, `${field}.multisite_enabled`);
  if (!multisiteEnabled.ok) {
    return multisiteEnabled;
  }

  const networkId = optionalString(value.network_id);
  const networkName = optionalString(value.network_name);
  const siteId = optionalString(value.site_id);
  const siteUrl = optionalString(value.site_url);
  const sitePath = optionalString(value.site_path);
  const inferredMultisite = Boolean(networkId || networkName || siteId || sitePath);

  return {
    ok: true,
    value: {
      multisite_enabled: multisiteEnabled.value ?? inferredMultisite,
      network_id: networkId,
      network_name: networkName,
      site_id: siteId,
      site_url: siteUrl,
      site_path: sitePath
    }
  };
}

function optionalBoolean(value, field) {
  if (value === undefined || value === null || value === "") {
    return {
      ok: true,
      value: null
    };
  }

  if (typeof value === "boolean") {
    return {
      ok: true,
      value
    };
  }

  if (typeof value === "number") {
    if (value === 1 || value === 0) {
      return {
        ok: true,
        value: value === 1
      };
    }

    return invalid("invalid_field", `${field} must be a boolean when provided.`);
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return {
      ok: true,
      value: true
    };
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return {
      ok: true,
      value: false
    };
  }

  return invalid("invalid_field", `${field} must be a boolean when provided.`);
}

function normalizeConsent(value) {
  const source = isPlainObject(value) ? value : {};

  return {
    analytics_storage: normalizeConsentValue(source.analytics_storage),
    ad_storage: normalizeConsentValue(source.ad_storage),
    ad_user_data: normalizeConsentValue(source.ad_user_data),
    ad_personalization: normalizeConsentValue(source.ad_personalization)
  };
}

function normalizeConsentValue(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["granted", "denied"].includes(normalized) ? normalized : null;
}

function invalid(code, message) {
  return {
    ok: false,
    code,
    message
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
