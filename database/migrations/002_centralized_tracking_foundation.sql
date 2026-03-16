CREATE TABLE IF NOT EXISTS websites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    website_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    platform_type TEXT NOT NULL DEFAULT 'wordpress',
    environment TEXT NOT NULL DEFAULT 'production',
    status TEXT NOT NULL DEFAULT 'active',
    public_key TEXT NOT NULL UNIQUE,
    secret_key_hash TEXT NOT NULL,
    -- HMAC verification needs the original secret material, so the server keeps
    -- an encrypted copy in addition to the non-reversible hash.
    secret_key_encrypted TEXT NOT NULL,
    config_version INTEGER NOT NULL DEFAULT 1,
    config_json TEXT NOT NULL DEFAULT '{}',
    installed_plugin_version TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    visitor_uuid TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    lead_email_hash TEXT,
    lead_phone_hash TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE(website_id, visitor_uuid),
    FOREIGN KEY (website_id) REFERENCES websites(id)
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    visitor_id INTEGER NOT NULL,
    session_uuid TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    landing_page_url TEXT,
    exit_page_url TEXT,
    referrer_url TEXT,
    referrer_domain TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,
    gclid TEXT,
    fbclid TEXT,
    msclkid TEXT,
    ttclid TEXT,
    qr_id TEXT,
    channel TEXT,
    source_category TEXT,
    is_direct INTEGER NOT NULL DEFAULT 0,
    pageviews INTEGER NOT NULL DEFAULT 0,
    engagement_seconds INTEGER NOT NULL DEFAULT 0,
    is_engaged INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(website_id, session_uuid),
    FOREIGN KEY (website_id) REFERENCES websites(id),
    FOREIGN KEY (visitor_id) REFERENCES visitors(id)
);

CREATE TABLE IF NOT EXISTS tracking_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    visitor_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    event_uuid TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_name TEXT,
    page_url TEXT,
    page_path TEXT,
    referrer_url TEXT,
    element_id TEXT,
    element_text TEXT,
    link_url TEXT,
    dedupe_key TEXT,
    value REAL,
    meta_json TEXT NOT NULL DEFAULT '{}',
    occurred_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    UNIQUE(website_id, event_uuid),
    FOREIGN KEY (website_id) REFERENCES websites(id),
    FOREIGN KEY (visitor_id) REFERENCES visitors(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS conversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    visitor_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    conversion_uuid TEXT NOT NULL,
    conversion_type TEXT NOT NULL,
    form_provider TEXT,
    form_id TEXT,
    form_title TEXT,
    page_url TEXT,
    value REAL,
    attribution_json TEXT NOT NULL DEFAULT '{}',
    submitted_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    UNIQUE(website_id, conversion_uuid),
    FOREIGN KEY (website_id) REFERENCES websites(id),
    FOREIGN KEY (visitor_id) REFERENCES visitors(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_websites_status ON websites(status);
CREATE INDEX IF NOT EXISTS idx_visitors_website_id ON visitors(website_id);
CREATE INDEX IF NOT EXISTS idx_visitors_visitor_uuid ON visitors(visitor_uuid);
CREATE INDEX IF NOT EXISTS idx_sessions_website_id ON sessions(website_id);
CREATE INDEX IF NOT EXISTS idx_sessions_visitor_id ON sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_session_uuid ON sessions(session_uuid);
CREATE INDEX IF NOT EXISTS idx_tracking_events_website_id ON tracking_events(website_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_occurred_at ON tracking_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_tracking_events_website_occurred_at ON tracking_events(website_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_conversions_website_id ON conversions(website_id);
CREATE INDEX IF NOT EXISTS idx_conversions_conversion_type ON conversions(conversion_type);
CREATE INDEX IF NOT EXISTS idx_conversions_website_conversion_type ON conversions(website_id, conversion_type);
