import { normalizeTrackingConfig } from "../domain/tracking-config.js";

export class TrackingIngestionService {
  constructor({
    database,
    websiteRepository,
    visitorRepository,
    sessionRepository,
    trackingEventRepository,
    conversionRepository,
    pluginTelemetryService = null,
    analyticsRefreshService = null,
    identityStitchingService = null,
    analyticsReportingService = null,
    logger = null
  }) {
    this.database = database;
    this.websiteRepository = websiteRepository;
    this.visitorRepository = visitorRepository;
    this.sessionRepository = sessionRepository;
    this.trackingEventRepository = trackingEventRepository;
    this.conversionRepository = conversionRepository;
    this.pluginTelemetryService = pluginTelemetryService;
    this.analyticsRefreshService = analyticsRefreshService;
    this.identityStitchingService = identityStitchingService;
    this.analyticsReportingService = analyticsReportingService;
    this.logger = logger;
  }

  ingestBatch(authContext, payload) {
    const website = authContext.website;
    const websiteConfig = normalizeTrackingConfig(website.config_json);
    const receivedAt = new Date().toISOString();
    const summary = {
      website_id: Number(website.id),
      received: payload.events.length,
      inserted: 0,
      duplicates: 0,
      conversions_created: 0,
      skipped_due_to_consent: 0
    };
    const visitorCache = new Map();
    const sessionCache = new Map();

    this.database.exec("BEGIN");
    try {
      this.pluginTelemetryService?.recordBatch(website, payload, receivedAt);

      for (const event of payload.events) {
        if (shouldSkipEventForConsent(websiteConfig, event)) {
          summary.skipped_due_to_consent += 1;
          continue;
        }

        if (this.trackingEventRepository.existsByEventUuid(website.id, event.event_uuid)) {
          summary.duplicates += 1;
          continue;
        }

        const visitor = this.resolveVisitor(website.id, event, visitorCache);
        const session = this.resolveSession(website.id, visitor.id, event, receivedAt, sessionCache);
        const insertedEventId = this.trackingEventRepository.insert({
          websiteId: website.id,
          visitorId: visitor.id,
          sessionId: session.id,
          eventUuid: event.event_uuid,
          eventType: event.event_type,
          eventName: event.event_name,
          pageUrl: event.page_url,
          pagePath: event.page_path,
          referrerUrl: event.referrer_url,
          elementId: stringValue(event.meta.element_id),
          elementText: stringValue(event.meta.element_text),
          linkUrl: stringValue(event.meta.link_url),
          dedupeKey: stringValue(event.meta.dedupe_key),
          value: numericValue(event.meta.value),
          metaJson: buildEventMeta(payload, event),
          occurredAt: event.occurred_at,
          receivedAt
        });

        if (!insertedEventId) {
          summary.duplicates += 1;
          continue;
        }

        summary.inserted += 1;
        const leadEmailHash = stringValue(event.meta.lead_email_hash);
        const leadPhoneHash = stringValue(event.meta.lead_phone_hash);
        this.visitorRepository.touchLastSeen(visitor.id, {
          lastSeenAt: event.occurred_at,
          leadEmailHash,
          leadPhoneHash
        });
        const stitchedProfileId = this.identityStitchingService?.stitchVisitor(website, visitor, {
          leadEmailHash,
          leadPhoneHash
        }, receivedAt);
        if (stitchedProfileId) {
          visitor.stitched_profile_id = stitchedProfileId;
        }

        const updatedSession = this.updateSessionAfterEvent(session, event, sessionCache, receivedAt);
        if (incrementsPageviews(event.event_type)) {
          this.sessionRepository.incrementPageviews(updatedSession.id, 1);
          updatedSession.pageviews = Number(updatedSession.pageviews ?? 0) + 1;
          updatedSession.updated_at = receivedAt;
          sessionCache.set(`${updatedSession.website_id}:${updatedSession.session_uuid}`, updatedSession);
        }

        if (isConversionEvent(event.event_type)) {
          const conversionId = this.conversionRepository.insert({
            websiteId: website.id,
            visitorId: visitor.id,
            sessionId: updatedSession.id,
            conversionUuid: event.event_uuid,
            conversionType: event.event_type,
            formProvider: stringValue(event.meta.form_provider),
            formId: stringValue(event.meta.form_id),
            formTitle: stringValue(event.meta.form_title ?? event.event_name),
            pageUrl: event.page_url,
            value: numericValue(event.meta.value),
            attributionJson: buildConversionAttribution(payload, event, updatedSession),
            submittedAt: event.occurred_at,
            receivedAt
          });

          if (conversionId) {
            summary.conversions_created += 1;
          }
        }
      }

      this.websiteRepository.updateHeartbeat(website.id, {
        lastSeenAt: receivedAt,
        installedPluginVersion: payload.plugin_version,
        updatedAt: receivedAt
      });
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      this.logger?.error?.("Tracking batch ingestion failed.", {
        websiteId: website.id,
        message: error.message
      });
      throw error;
    }

    if (summary.inserted > 0) {
      try {
        const affectedBounds = deriveAffectedBounds(payload.events);
        if (this.analyticsRefreshService) {
          this.analyticsRefreshService.enqueueWebsiteRefresh(website.id, {
            dateFrom: affectedBounds.dateFrom,
            dateTo: affectedBounds.dateTo,
            reason: "tracking_batch"
          });
        } else {
          this.analyticsReportingService?.refreshWebsite(website.id, affectedBounds);
        }
      } catch (error) {
        this.logger?.error?.("Tracking analytics refresh failed.", {
          websiteId: website.id,
          message: error.message
        });
      }
    }

    return summary;
  }

  resolveVisitor(websiteId, event, cache) {
    const cacheKey = `${websiteId}:${event.visitor_id}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    let visitor = this.visitorRepository.findByWebsiteAndVisitorUuid(websiteId, event.visitor_id);
    if (!visitor) {
      this.visitorRepository.create({
        websiteId,
        visitorUuid: event.visitor_id,
        firstSeenAt: event.occurred_at,
        lastSeenAt: event.occurred_at,
        leadEmailHash: stringValue(event.meta.lead_email_hash),
        leadPhoneHash: stringValue(event.meta.lead_phone_hash),
        metadataJson: {}
      });
      visitor = this.visitorRepository.findByWebsiteAndVisitorUuid(websiteId, event.visitor_id);
    }

    if (!visitor) {
      throw new Error(`Unable to resolve visitor ${event.visitor_id}.`);
    }

    cache.set(cacheKey, visitor);
    return visitor;
  }

  resolveSession(websiteId, visitorId, event, receivedAt, cache) {
    const cacheKey = `${websiteId}:${event.session_id}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    let session = this.sessionRepository.findByWebsiteAndSessionUuid(websiteId, event.session_id);
    if (!session) {
      this.sessionRepository.create({
        websiteId,
        visitorId,
        sessionUuid: event.session_id,
        startedAt: event.occurred_at,
        endedAt: event.occurred_at,
        landingPageUrl: event.page_url,
        exitPageUrl: event.page_url,
        referrerUrl: event.referrer_url,
        referrerDomain: extractDomain(event.referrer_url),
        utmSource: event.utm.source,
        utmMedium: event.utm.medium,
        utmCampaign: event.utm.campaign,
        utmTerm: event.utm.term,
        utmContent: event.utm.content,
        gclid: event.click_ids.gclid,
        fbclid: event.click_ids.fbclid,
        msclkid: event.click_ids.msclkid,
        ttclid: event.click_ids.ttclid,
        qrId: stringValue(event.meta.qr_id),
        channel: stringValue(event.meta.channel),
        sourceCategory: stringValue(event.meta.source_category),
        deviceType: extractDeviceType(event.meta),
        browserName: extractBrowserName(event.meta),
        isDirect: deriveIsDirect(event),
        pageviews: 0,
        engagementSeconds: numericValue(event.meta.engagement_seconds) ?? 0,
        isEngaged: booleanValue(event.meta.is_engaged),
        consentStateJson: hasConsentState(event.consent) ? event.consent : {},
        consentUpdatedAt: hasConsentState(event.consent) ? event.occurred_at : null,
        createdAt: receivedAt,
        updatedAt: receivedAt
      });
      session = this.sessionRepository.findByWebsiteAndSessionUuid(websiteId, event.session_id);
    }

    if (!session) {
      throw new Error(`Unable to resolve session ${event.session_id}.`);
    }

    cache.set(cacheKey, session);
    return session;
  }

  updateSessionAfterEvent(session, event, cache, receivedAt) {
    const patch = buildSessionPatch(session, event, receivedAt);
    const cacheKey = `${session.website_id}:${session.session_uuid}`;
    let nextSession = session;

    if (Object.keys(patch).length > 0) {
      this.sessionRepository.updateFromEvent(session.id, patch);
      nextSession = {
        ...session,
        ...patch
      };
      cache.set(cacheKey, nextSession);
    }

    return nextSession;
  }
}

function buildSessionPatch(session, event, receivedAt) {
  const patch = {};
  const eventTime = Date.parse(event.occurred_at);
  const startedAtTime = Date.parse(String(session.started_at ?? ""));
  const endedAtTime = Date.parse(String(session.ended_at ?? ""));

  if (!session.landing_page_url && event.page_url) {
    patch.landing_page_url = event.page_url;
  }

  if (Number.isFinite(eventTime) && (!Number.isFinite(startedAtTime) || eventTime < startedAtTime)) {
    patch.started_at = event.occurred_at;
    if (event.page_url) {
      patch.landing_page_url = event.page_url;
    }
  }

  if (!session.referrer_url && event.referrer_url) {
    patch.referrer_url = event.referrer_url;
  }

  if (!session.referrer_domain && event.referrer_url) {
    patch.referrer_domain = extractDomain(event.referrer_url);
  }

  const fillIfMissing = [
    ["utm_source", event.utm.source],
    ["utm_medium", event.utm.medium],
    ["utm_campaign", event.utm.campaign],
    ["utm_term", event.utm.term],
    ["utm_content", event.utm.content],
    ["gclid", event.click_ids.gclid],
    ["fbclid", event.click_ids.fbclid],
    ["msclkid", event.click_ids.msclkid],
    ["ttclid", event.click_ids.ttclid],
    ["qr_id", stringValue(event.meta.qr_id)],
    ["channel", stringValue(event.meta.channel)],
    ["source_category", stringValue(event.meta.source_category)],
    ["device_type", extractDeviceType(event.meta)],
    ["browser_name", extractBrowserName(event.meta)]
  ];

  fillIfMissing.forEach(([field, value]) => {
    if (!session[field] && value) {
      patch[field] = value;
    }
  });

  if (!Number.isFinite(endedAtTime) || eventTime >= endedAtTime) {
    patch.ended_at = event.occurred_at;
    if (event.page_url) {
      patch.exit_page_url = event.page_url;
    }
  }

  if (event.event_type === "session_end") {
    patch.ended_at = event.occurred_at;
    if (event.page_url) {
      patch.exit_page_url = event.page_url;
    }
  }

  const engagementSeconds = numericValue(event.meta.engagement_seconds);
  if (engagementSeconds !== null && engagementSeconds > Number(session.engagement_seconds ?? 0)) {
    patch.engagement_seconds = engagementSeconds;
  }

  if (booleanValue(event.meta.is_engaged) && !booleanValue(session.is_engaged)) {
    patch.is_engaged = 1;
  }

  if (hasConsentState(event.consent)) {
    patch.consent_state_json = event.consent;
    patch.consent_updated_at = event.occurred_at;
  }

  if (Object.keys(patch).length > 0) {
    patch.updated_at = receivedAt;
  }

  return patch;
}

function buildEventMeta(payload, event) {
  return {
    ...event.meta,
    consent: event.consent,
    _batch: {
      installation_id: payload.installation_id,
      plugin_version: payload.plugin_version,
      sent_at: payload.sent_at,
      wordpress: payload.wordpress ?? null
    }
  };
}

function buildConversionAttribution(payload, event, session) {
  return {
    session_uuid: session.session_uuid,
    landing_page_url: session.landing_page_url ?? null,
    exit_page_url: session.exit_page_url ?? null,
    referrer_url: session.referrer_url ?? null,
    referrer_domain: session.referrer_domain ?? null,
    utm: {
      source: session.utm_source ?? null,
      medium: session.utm_medium ?? null,
      campaign: session.utm_campaign ?? null,
      term: session.utm_term ?? null,
      content: session.utm_content ?? null
    },
    click_ids: {
      gclid: session.gclid ?? null,
      fbclid: session.fbclid ?? null,
      msclkid: session.msclkid ?? null,
      ttclid: session.ttclid ?? null
    },
    channel: session.channel ?? null,
    source_category: session.source_category ?? null,
    is_direct: booleanValue(session.is_direct),
    event_name: event.event_name ?? null,
    event_meta: event.meta,
    _batch: {
      installation_id: payload.installation_id,
      plugin_version: payload.plugin_version,
      sent_at: payload.sent_at,
      wordpress: payload.wordpress ?? null
    }
  };
}

function isConversionEvent(eventType) {
  return eventType === "conversion" || eventType === "form_submit";
}

function incrementsPageviews(eventType) {
  return eventType === "page_view";
}

function deriveIsDirect(event) {
  return !event.referrer_url
    && !event.utm.source
    && !event.utm.medium
    && !event.utm.campaign
    && !event.utm.term
    && !event.utm.content
    && !event.click_ids.gclid
    && !event.click_ids.fbclid
    && !event.click_ids.msclkid
    && !event.click_ids.ttclid;
}

function extractDomain(value) {
  const input = stringValue(value);
  if (!input) {
    return null;
  }

  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function stringValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function shouldSkipEventForConsent(websiteConfig, event) {
  return websiteConfig.respect_consent_mode
    && event.event_type !== "consent_update"
    && event.consent.analytics_storage === "denied";
}

function hasConsentState(consent) {
  return Boolean(consent)
    && Object.values(consent).some((value) => value === "granted" || value === "denied");
}

function extractDeviceType(meta) {
  return stringValue(meta?.device_type ?? meta?.device);
}

function extractBrowserName(meta) {
  return stringValue(meta?.browser_name ?? meta?.browser);
}

function deriveAffectedBounds(events) {
  const dates = events
    .map((event) => String(event?.occurred_at ?? "").slice(0, 10))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/u.test(value))
    .sort((left, right) => left.localeCompare(right));

  if (dates.length === 0) {
    return {
      fullRebuild: true
    };
  }

  return {
    dateFrom: dates[0],
    dateTo: dates[dates.length - 1]
  };
}
