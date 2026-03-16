# JF Link Generator Bot Node

This is the Node.js port of the internal JF Link Generator Bot for ClickUp Chat. A teammate posts a natural-language request in a dedicated ClickUp Chat channel, the backend parses it into a strict schema, applies deterministic JF tracking rules, creates a five-field UTM URL, shortens it with Bitly, optionally creates a QR code URL, and posts the result back into the same Chat channel.

## Stack

- Node.js 22.x
- Native `fetch`
- Native `node:sqlite`
- No framework
- SQLite by default

## What It Does

1. Receives `POST /webhooks/clickup/chat` from ClickUp Chat Automation.
2. Validates the shared-secret header, workspace, and channel allowlist.
3. Stores the inbound request and audit trail in SQLite.
4. Parses the request with:
   - strict fallback command parsing first
   - OpenAI Responses API structured JSON second
   - heuristic parsing as a fallback
5. Applies deterministic client, channel, alias, campaign, and five-field UTM rules in Node.
6. Reuses an existing short link when the normalized fingerprint already exists.
7. Calls Bitly when a new short link is needed.
8. Generates a QR image URL when the request implies offline or QR usage.
9. Posts the result back into the same ClickUp Chat channel or thread.

## Centralized Website Tracking Foundation

This phase extends the app into a real central tracking hub for WordPress client websites. The backend now supports signed plugin traffic, client-level website grouping, per-site credential administration, multisite-aware installation telemetry, consent-aware event ingestion, and internal attribution reporting.

What was added:

- website registrations with per-site public and secret credentials
- client records so one client can own many monitored websites inside the same app
- internal admin UI for listing websites by client, provisioning new sites, rotating credentials, and disabling access
- signed plugin API authentication using `X-JF-Public-Key`, `X-JF-Timestamp`, and `X-JF-Signature`
- new persistence tables for websites, visitors, sessions, tracking events, and conversions
- multisite-aware WordPress context storage for network id, network name, site id, and site path
- installation telemetry tables for heartbeat, batch, config-fetch, and version-change history
- default per-website tracking config storage and normalization
- richer tracking event support including scroll, outbound click, phone click, file download, session lifecycle, consent updates, and custom events
- consent-aware ingestion when `respect_consent_mode=true`
- conversion attribution models for first touch, last touch, and last non-direct
- daily traffic and conversion rollups plus internal reporting endpoints

New routes:

- `POST /api/v1/tracking/events/batch`
- `GET /api/v1/plugin/config`
- `POST /api/v1/plugin/heartbeat`
- `GET /admin/websites`
- `POST /admin/websites`
- `POST /admin/websites/rotate`
- `POST /admin/websites/status`
- `GET /admin/reports`
- `GET /admin/reports.json`
  - all protected with the same HTTP Basic auth used by the internal library and builder routes

Signed auth model:

- each website gets a `public_key` plus a one-time `secret_key`
- the plain secret is shown only once when the website is provisioned
- the app stores both a non-reversible hash and an encrypted copy of the secret
- requests sign `<timestamp>.<raw-body>` with HMAC SHA256
- timestamps outside the configured freshness window are rejected

Current limitations:

- WordPress plugin packaging and distribution are still outside this repo
- reporting is intentionally lightweight and SQLite-backed; there is no external warehouse or scheduled job system yet
- attribution rollups are recalculated inside the app and should be revisited if event volume grows substantially
- this phase persists raw tracking and telemetry data first; advanced attribution, aggregation, and plugin-side UX still evolve in later phases

## Project Structure

```text
jf-utm-bitly-generator/
  bin/
  config/
  database/
    migrations/
  docs/
  public/
  src/
    controllers/
    domain/
    http/
    repositories/
    services/
    support/
  storage/
    database/
    logs/
  tests/
    fixtures/
```

## Requirements

- Node.js 22.x
- OpenAI API key
- ClickUp API token
- Bitly access token

Use Node 22.13.0 or newer when possible. This app uses native `node:sqlite`, which was introduced in Node 22 and required an experimental flag in earlier 22.x minors.

## Local Setup

1. Copy the environment file:

   ```bash
   cp .env.example .env
   ```

2. Fill in `.env` with the real credentials.
3. Run migrations:

   ```bash
   node ./bin/migrate.js
   ```

4. Start the server:

   ```bash
   node ./bin/server.js
   ```

5. Verify health:

   ```bash
   curl http://127.0.0.1:3000/health
   ```

## Production Deployment

1. Deploy the `jf-utm-bitly-generator/` folder to the server.
2. Keep `.env` outside version control.
3. Ensure `storage/database/` and `storage/logs/` are writable.
4. Run:

   ```bash
   node ./bin/migrate.js
   ```

5. Start the service with a process manager such as `pm2`, `systemd`, or Docker.
6. Put the app behind HTTPS.
7. Point ClickUp Chat Automation to:

   ```text
   https://your-app.example.com/webhooks/clickup/chat
   ```

## Available Scripts

- `npm run start`
- `npm run dev`
- `npm run migrate`
- `npm run test`

## Environment Variables

### Required

- `APP_ENV`
- `APP_URL`
- `APP_PORT`
- `APP_DEBUG`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `CLICKUP_API_TOKEN`
- `CLICKUP_WORKSPACE_ID`
- `CLICKUP_CHAT_CHANNEL_ID`
- `CLICKUP_WEBHOOK_SECRET`
- `BITLY_ACCESS_TOKEN`
- `BITLY_DOMAIN`
- `DATABASE_PATH`
- `LOG_PATH`
- `DEFAULT_TIMEZONE`

### Strongly Recommended

- `CLICKUP_ALLOWED_CHANNEL_IDS`
- `CLICKUP_IGNORE_USER_IDS`
- `CLICKUP_IGNORE_USERNAMES`
- `REQUEST_RATE_LIMIT`
- `REQUEST_RATE_WINDOW_SECONDS`
- `PARSER_CONFIDENCE_THRESHOLD`

### Optional

- `BITLY_GROUP_GUID`
- `QR_BASE_URL`
- `QR_SIZE`
- `TRACKING_SECRET_ENCRYPTION_KEY`
- `TRACKING_SIGNATURE_MAX_AGE_SECONDS`
- `LIBRARY_AUTH_ENABLED`
- `LIBRARY_AUTH_USERNAME`
- `LIBRARY_AUTH_PASSWORD`
- `LIBRARY_AUTH_REALM`
- `CLICKUP_SIGNATURE_HEADER`
- `CLICKUP_CHAT_MESSAGE_CONTENT_FIELD`
- `CLICKUP_CHAT_MESSAGE_FALLBACK_FIELD`

## Endpoints

- `GET /health`
- `GET /new`
  - structured UTM builder UI with taxonomy-backed suggestions and inline result output
- `POST /new`
  - JSON endpoint used by the builder UI to create a tracked link through the shared generation pipeline
- `GET /utms`
  - read-only HTML library of unique tracked links with filters and pagination
- `GET /utms.json`
  - JSON export of the current filtered library view
- `GET /utms.csv`
  - CSV export of the current filtered library view
- `POST /api/v1/tracking/events/batch`
  - signed plugin ingestion endpoint for first-party event batches
- `GET /api/v1/plugin/config`
  - signed plugin config endpoint returning normalized website tracking settings
- `POST /api/v1/plugin/heartbeat`
  - signed plugin heartbeat endpoint for site status and plugin version reporting
- `GET /admin/websites`
  - internal client and website admin UI with grouped website cards
- `POST /admin/websites`
  - internal JSON route for provisioning website credentials
- `POST /admin/websites/rotate`
  - internal JSON route for rotating one website's credentials
- `POST /admin/websites/status`
  - internal JSON route for enabling or disabling one website
- `GET /admin/reports`
  - internal attribution and traffic reporting UI
- `GET /admin/reports.json`
  - JSON reporting endpoint for the selected site/date range/model
- `GET /debug/sample-payload`
  - only when `APP_DEBUG=true` or `DEBUG_WEBHOOK=true`
- `GET /debug/webhook-info`
  - only when `APP_DEBUG=true` or `DEBUG_WEBHOOK=true`
- `POST /debug/webhook-echo`
  - only when `APP_DEBUG=true` or `DEBUG_WEBHOOK=true`
- `POST /webhooks/clickup/chat`

## ClickUp Payload Mapping

ClickUp Chat webhook payloads can vary. The mapping is isolated in [`src/services/clickup-payload-mapper.js`](/c:/Users/AminHcinet/Documents/JF%20TOOL/jf-utm-bitly-generator/src/services/clickup-payload-mapper.js), and the sample fixtures live under `tests/fixtures/`.

Recommended first-run process:

1. Launch with `APP_DEBUG=true`.
2. Send one real ClickUp test message.
3. Inspect the stored `raw_payload` row in SQLite.
4. Update the mapper only if your workspace payload differs.

## Security Notes

- Secrets only come from environment variables.
- The webhook uses a static shared-secret header match because ClickUp Chat Automation does not compute an HMAC for you.
- Channel allowlisting is supported.
- Self-message ignore lists are supported to avoid bot loops.
- Logs redact common sensitive keys.
- The builder and UTM library routes use HTTP Basic auth by default.
- Website tracking routes use per-website HMAC signatures instead of the ClickUp shared-secret model.
- Tracking secrets require `TRACKING_SECRET_ENCRYPTION_KEY` so the server can decrypt stored site secrets for signature verification.
  - Default credentials: `justflow` / `preview`
  - Override them with `LIBRARY_AUTH_USERNAME` and `LIBRARY_AUTH_PASSWORD`

## Attribution And Reporting

The reporting layer currently ships with:

- first-touch attribution
- last-touch attribution
- last-non-direct attribution
- daily traffic rollups for visitors, sessions, pageviews, events, engaged sessions, and raw conversions
- daily attributed conversion rollups for channel, source category, source, medium, and campaign

The internal reporting UI lives at `/admin/reports`. It recalculates rollups for the selected website before rendering the current summary.

## Plugin Telemetry

Each authenticated site can now accumulate installation history under the internal website admin screen:

- heartbeat events
- batch-received events
- config-fetch events
- version-change events
- multisite-aware network and site metadata for WordPress multisite installs

This makes it possible to inspect plugin version drift, stale installs, credential rotation history, and which monitored sites belong to the same client or multisite network without querying SQLite manually.

## Testing

Run:

```bash
node ./tests/run.js
```

Covered cases:

- alias normalization
- campaign fallback generation
- five-field UTM generation with existing query params
- duplicate fingerprint generation
- clarification branching
- unsupported client/channel handling

## Manual Testing Assets

- Sample payloads: `tests/fixtures/clickup-chat-message.json`, `tests/fixtures/clickup-test-webhook.json`
- Curl examples: [`docs/CURL_EXAMPLES.md`](/c:/Users/AminHcinet/Documents/JF%20TOOL/jf-utm-bitly-generator/docs/CURL_EXAMPLES.md)
- Postman collection: [`docs/postman_collection.json`](/c:/Users/AminHcinet/Documents/JF%20TOOL/jf-utm-bitly-generator/docs/postman_collection.json)
- Debug guide: [`DEBUG_WEBHOOK.md`](/c:/Users/AminHcinet/Documents/JF%20TOOL/jf-utm-bitly-generator/DEBUG_WEBHOOK.md)

## UTM Library

The app now exposes a read-only UTM library at `/utms`. It shows one row per unique fingerprinted tracked link, not one row per duplicate request, so teammates can browse the real library instead of raw webhook history.

Supported query params:

- `search`
- `client`
- `channel`
- `source`
- `medium`
- `campaign`
- `status`
- `short_link`
- `qr`
- `sort`
- `page`
- `per_page`

## Structured Builder

The app also exposes a structured builder at `/new`. It is designed to replace the spreadsheet workflow while keeping the same generation rules:

- choose a client first
- use client-specific taxonomy suggestions for source, medium, campaign, term, and content
- optionally choose a channel to prefill defaults
- generate the tracked URL, Bitly short link, and QR through the same backend pipeline used by ClickUp

If the exact UTM fields are left blank, the builder can still use the campaign label plus the imported client taxonomy to resolve the right combination.

## Failure Modes

- `403 rejected`
  - The shared secret, workspace id, or channel allowlist is wrong.
- `clarification_sent`
  - The parser could not confidently identify the full request.
- ClickUp reply failures
  - Confirm the outbound message body field. The app tries `content` first and `text_content` second.
- OpenAI failure
  - The bot falls back to heuristic parsing, which may still end in clarification.
- Bot loops
  - Add the bot user id or username to the ignore lists.

## Related Docs

- [`CLICKUP_SETUP.md`](/c:/Users/AminHcinet/Documents/JF%20TOOL/jf-utm-bitly-generator/CLICKUP_SETUP.md)
- [`TEAM_USAGE.md`](/c:/Users/AminHcinet/Documents/JF%20TOOL/jf-utm-bitly-generator/TEAM_USAGE.md)
- [`RULES_CONFIG.md`](/c:/Users/AminHcinet/Documents/JF%20TOOL/jf-utm-bitly-generator/RULES_CONFIG.md)
- [`PERFECTION_IDEAS.md`](/c:/Users/AminHcinet/Documents/JF%20TOOL/jf-utm-bitly-generator/PERFECTION_IDEAS.md)

## Implementation Checklist

1. What to create in ClickUp
   - Create a dedicated Chat channel named `jf-link-generator` and a channel-specific webhook Automation.
2. What API keys/accounts are needed
   - OpenAI API key, ClickUp API token for a service account, Bitly access token, and one shared webhook secret.
3. What to configure in `.env`
   - Copy `.env.example`, then fill the OpenAI, ClickUp, Bitly, database, log, and timezone settings.
4. How to run locally
   - Run `node ./bin/migrate.js`, then `node ./bin/server.js`.
5. How to test with sample payloads
   - Use the curl or Postman assets in `docs/` against the fixture in `tests/fixtures/`.
6. How to deploy
   - Put the app on a Node server, run migrations, start it with a process manager, and expose it over HTTPS.
7. How to verify end-to-end from a real ClickUp Chat message
   - Post: `Need an Instagram link for Studleys spring sale to https://studleys.com/perennials`.
8. How to train teammates to use it
   - Share `TEAM_USAGE.md`, pin a few working examples in the channel, and keep the channel focused on one request per message.
