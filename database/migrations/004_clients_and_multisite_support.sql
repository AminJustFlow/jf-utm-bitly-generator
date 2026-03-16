CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO clients (client_name, status, created_at, updated_at)
SELECT DISTINCT
    client_name,
    'active',
    created_at,
    updated_at
FROM websites
WHERE client_name IS NOT NULL
  AND TRIM(client_name) <> '';

ALTER TABLE websites ADD COLUMN client_id INTEGER REFERENCES clients(id);
ALTER TABLE websites ADD COLUMN wp_multisite_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE websites ADD COLUMN wp_network_id TEXT;
ALTER TABLE websites ADD COLUMN wp_network_name TEXT;
ALTER TABLE websites ADD COLUMN wp_site_id TEXT;
ALTER TABLE websites ADD COLUMN wp_site_path TEXT;

UPDATE websites
SET client_id = (
    SELECT clients.id
    FROM clients
    WHERE clients.client_name = websites.client_name
    LIMIT 1
)
WHERE client_id IS NULL;

ALTER TABLE website_installations ADD COLUMN wp_multisite_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE website_installations ADD COLUMN wp_network_id TEXT;
ALTER TABLE website_installations ADD COLUMN wp_network_name TEXT;
ALTER TABLE website_installations ADD COLUMN wp_site_id TEXT;
ALTER TABLE website_installations ADD COLUMN wp_site_url TEXT;
ALTER TABLE website_installations ADD COLUMN wp_site_path TEXT;

CREATE INDEX IF NOT EXISTS idx_websites_client_id ON websites(client_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_website_installations_network ON website_installations(website_id, wp_network_id, wp_site_id);
