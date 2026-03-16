ALTER TABLE websites ADD COLUMN credentials_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE websites ADD COLUMN last_credentials_rotated_at TEXT;

ALTER TABLE sessions ADD COLUMN consent_state_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE sessions ADD COLUMN consent_updated_at TEXT;

CREATE TABLE IF NOT EXISTS website_installations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    installation_id TEXT NOT NULL,
    plugin_version TEXT,
    wp_version TEXT,
    php_version TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_heartbeat_at TEXT,
    last_batch_received_at TEXT,
    last_config_fetched_at TEXT,
    last_sent_at TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(website_id, installation_id),
    FOREIGN KEY (website_id) REFERENCES websites(id)
);

CREATE TABLE IF NOT EXISTS website_installation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    installation_row_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    plugin_version TEXT,
    wp_version TEXT,
    php_version TEXT,
    status TEXT,
    details_json TEXT NOT NULL DEFAULT '{}',
    occurred_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    FOREIGN KEY (website_id) REFERENCES websites(id),
    FOREIGN KEY (installation_row_id) REFERENCES website_installations(id)
);

CREATE TABLE IF NOT EXISTS website_credential_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    public_key TEXT NOT NULL,
    credentials_version INTEGER NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (website_id) REFERENCES websites(id)
);

CREATE TABLE IF NOT EXISTS conversion_attributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    conversion_id INTEGER NOT NULL,
    conversion_uuid TEXT NOT NULL,
    model_key TEXT NOT NULL,
    attributed_session_id INTEGER,
    attributed_visitor_id INTEGER,
    source_category TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT '',
    referrer_domain TEXT NOT NULL DEFAULT '',
    utm_source TEXT NOT NULL DEFAULT '',
    utm_medium TEXT NOT NULL DEFAULT '',
    utm_campaign TEXT NOT NULL DEFAULT '',
    utm_term TEXT NOT NULL DEFAULT '',
    utm_content TEXT NOT NULL DEFAULT '',
    is_direct INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(conversion_id, model_key),
    FOREIGN KEY (website_id) REFERENCES websites(id),
    FOREIGN KEY (conversion_id) REFERENCES conversions(id),
    FOREIGN KEY (attributed_session_id) REFERENCES sessions(id),
    FOREIGN KEY (attributed_visitor_id) REFERENCES visitors(id)
);

CREATE TABLE IF NOT EXISTS analytics_daily_traffic_rollups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    rollup_date TEXT NOT NULL,
    visitors INTEGER NOT NULL DEFAULT 0,
    sessions INTEGER NOT NULL DEFAULT 0,
    pageviews INTEGER NOT NULL DEFAULT 0,
    events INTEGER NOT NULL DEFAULT 0,
    engaged_sessions INTEGER NOT NULL DEFAULT 0,
    conversions INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(website_id, rollup_date),
    FOREIGN KEY (website_id) REFERENCES websites(id)
);

CREATE TABLE IF NOT EXISTS analytics_daily_conversion_rollups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    rollup_date TEXT NOT NULL,
    attribution_model TEXT NOT NULL,
    conversion_type TEXT NOT NULL DEFAULT '',
    source_category TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT '',
    referrer_domain TEXT NOT NULL DEFAULT '',
    utm_source TEXT NOT NULL DEFAULT '',
    utm_medium TEXT NOT NULL DEFAULT '',
    utm_campaign TEXT NOT NULL DEFAULT '',
    conversions INTEGER NOT NULL DEFAULT 0,
    conversion_value REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(
        website_id,
        rollup_date,
        attribution_model,
        conversion_type,
        source_category,
        channel,
        referrer_domain,
        utm_source,
        utm_medium,
        utm_campaign
    ),
    FOREIGN KEY (website_id) REFERENCES websites(id)
);

CREATE INDEX IF NOT EXISTS idx_website_installations_website_id ON website_installations(website_id);
CREATE INDEX IF NOT EXISTS idx_website_installations_installation_id ON website_installations(installation_id);
CREATE INDEX IF NOT EXISTS idx_website_installation_events_website_id ON website_installation_events(website_id);
CREATE INDEX IF NOT EXISTS idx_website_installation_events_installation_row_id ON website_installation_events(installation_row_id);
CREATE INDEX IF NOT EXISTS idx_website_installation_events_occurred_at ON website_installation_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_website_credential_events_website_id ON website_credential_events(website_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversion_attributions_website_model ON conversion_attributions(website_id, model_key);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_traffic_rollups_website_date ON analytics_daily_traffic_rollups(website_id, rollup_date);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_conversion_rollups_website_date ON analytics_daily_conversion_rollups(website_id, rollup_date);
