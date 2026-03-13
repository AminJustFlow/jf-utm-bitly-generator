CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_uuid TEXT NOT NULL UNIQUE,
    delivery_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    original_message TEXT NOT NULL,
    raw_payload TEXT,
    parsed_payload TEXT,
    normalized_payload TEXT,
    fingerprint TEXT,
    final_long_url TEXT,
    short_url TEXT,
    qr_url TEXT,
    warnings TEXT,
    missing_fields TEXT,
    clickup_workspace_id TEXT,
    clickup_channel_id TEXT,
    clickup_message_id TEXT,
    clickup_thread_message_id TEXT,
    source_user_id TEXT,
    source_user_name TEXT,
    response_message_id TEXT,
    reused_existing INTEGER DEFAULT 0,
    openai_request_id TEXT,
    openai_model TEXT,
    bitly_id TEXT,
    bitly_payload TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_channel_created ON requests(clickup_channel_id, created_at);

CREATE TABLE IF NOT EXISTS generated_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT NOT NULL UNIQUE,
    client TEXT NOT NULL,
    channel TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    normalized_destination_url TEXT NOT NULL,
    canonical_campaign TEXT NOT NULL,
    final_long_url TEXT NOT NULL,
    short_url TEXT NOT NULL,
    qr_url TEXT,
    bitly_id TEXT,
    bitly_payload TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generated_links_lookup ON generated_links(client, channel, canonical_campaign);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER,
    level TEXT NOT NULL,
    event_type TEXT NOT NULL,
    message TEXT NOT NULL,
    context_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_request ON audit_logs(request_id, created_at);
