const PAID_SEARCH_MEDIA = new Set(["cpc", "ppc", "paidsearch", "paid_search", "sem"]);
const ORGANIC_SEARCH_MEDIA = new Set(["organic", "organic_search", "seo"]);
const EMAIL_MEDIA = new Set(["email", "newsletter", "e-mail"]);
const SOCIAL_MEDIA = new Set(["social", "social_paid", "paid_social", "facebook", "instagram", "linkedin", "tiktok", "x", "twitter"]);
const DISPLAY_MEDIA = new Set(["display", "banner", "programmatic"]);
const SMS_MEDIA = new Set(["sms", "text"]);
const REFERRAL_MEDIA = new Set(["referral", "partner"]);

export const TRAFFIC_DIMENSION_TYPES = Object.freeze({
  overall: "overall",
  channel: "channel",
  source: "source",
  medium: "medium",
  campaign: "campaign",
  landingPage: "landing_page",
  referrerDomain: "referrer_domain",
  deviceType: "device_type",
  browser: "browser",
  eventType: "event_type"
});

export class TrafficDimensionService {
  resolveSessionDimensions(session, context = {}) {
    const snapshotContext = {
      device_type: session.device_type,
      browser_name: session.browser_name,
      ...context
    };

    return {
      channel: this.resolveChannel(session),
      source: this.resolveSource(session),
      medium: this.resolveMedium(session),
      campaign: this.resolveCampaign(session),
      landingPage: this.resolveLandingPage(session),
      referrerDomain: this.resolveReferrerDomain(session),
      deviceType: this.resolveDeviceType(snapshotContext),
      browser: this.resolveBrowser(snapshotContext)
    };
  }

  resolveChannel(session) {
    // Prefer an explicit channel set during ingestion, then fall back to
    // medium/direct/referrer heuristics so traffic reports stay populated.
    const explicitChannel = normalizedString(session.channel);
    if (explicitChannel) {
      return explicitChannel;
    }

    const medium = normalizedString(session.utm_medium).toLowerCase();
    if (PAID_SEARCH_MEDIA.has(medium)) {
      return "paid_search";
    }
    if (ORGANIC_SEARCH_MEDIA.has(medium)) {
      return "organic_search";
    }
    if (EMAIL_MEDIA.has(medium)) {
      return "email";
    }
    if (SOCIAL_MEDIA.has(medium)) {
      return "social";
    }
    if (DISPLAY_MEDIA.has(medium)) {
      return "display";
    }
    if (SMS_MEDIA.has(medium)) {
      return "sms";
    }
    if (REFERRAL_MEDIA.has(medium)) {
      return "referral";
    }
    if (truthy(session.is_direct)) {
      return "direct";
    }
    if (normalizedString(session.qr_id)) {
      return "qr";
    }
    if (normalizedString(session.referrer_domain)) {
      return "referral";
    }

    return "unknown";
  }

  resolveSource(session) {
    const utmSource = normalizedString(session.utm_source);
    if (utmSource) {
      return utmSource;
    }

    const referrerDomain = normalizedString(session.referrer_domain).toLowerCase();
    if (referrerDomain) {
      return referrerDomain;
    }

    return "direct";
  }

  resolveCampaign(session) {
    return normalizedString(session.utm_campaign) || "(none)";
  }

  resolveMedium(session) {
    // Medium is the raw reporting dimension, so keep the captured utm_medium
    // when present and only fall back to direct/referral/(none) when absent.
    const utmMedium = normalizedString(session.utm_medium);
    if (utmMedium) {
      return utmMedium;
    }

    if (truthy(session.is_direct)) {
      return "direct";
    }

    if (normalizedString(session.referrer_domain)) {
      return "referral";
    }

    return "(none)";
  }

  resolveLandingPage(session) {
    const landingPage = normalizedString(session.landing_page_url);
    if (!landingPage) {
      return "(unknown)";
    }

    try {
      const parsed = new URL(landingPage);
      const normalizedPath = `${parsed.pathname || "/"}${parsed.search || ""}`;
      return normalizedPath || "/";
    } catch {
      if (landingPage.startsWith("/")) {
        return landingPage;
      }
      return landingPage;
    }
  }

  resolveReferrerDomain(session) {
    return normalizedString(session.referrer_domain).toLowerCase() || "direct";
  }

  resolveDeviceType(context = {}) {
    // Device/browser are derived from event metadata when the plugin sends it.
    return normalizedString(
      context.deviceType
      ?? context.device_type
      ?? context.device
    ) || "unknown";
  }

  resolveBrowser(context = {}) {
    return normalizedString(
      context.browser
      ?? context.browserName
      ?? context.browser_name
    ) || "unknown";
  }

  resolveEventType(eventType) {
    return normalizedString(eventType) || "unknown";
  }
}

function normalizedString(value) {
  return String(value ?? "").trim();
}

function truthy(value) {
  return value === true || value === 1 || value === "1";
}
