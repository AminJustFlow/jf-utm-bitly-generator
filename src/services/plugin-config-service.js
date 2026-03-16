import { normalizeTrackingConfig } from "../domain/tracking-config.js";

export class PluginConfigService {
  getWebsiteConfig(website) {
    const config = normalizeTrackingConfig(website?.config_json);

    return {
      website_id: Number(website?.id ?? 0),
      website_name: website?.website_name ?? "",
      config_version: Number(website?.config_version ?? 1),
      session_timeout_minutes: config.session_timeout_minutes,
      cookie_retention_days: config.cookie_retention_days,
      track_scroll: config.track_scroll,
      track_outbound_clicks: config.track_outbound_clicks,
      track_phone_clicks: config.track_phone_clicks,
      track_file_downloads: config.track_file_downloads,
      respect_consent_mode: config.respect_consent_mode,
      excluded_roles: config.excluded_roles
    };
  }
}
