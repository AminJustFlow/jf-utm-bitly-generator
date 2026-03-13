# JF Link Generator Bot Node

This is the Node.js port of the internal JF Link Generator Bot for ClickUp Chat. A teammate posts a natural-language request in a dedicated ClickUp Chat channel, the backend parses it into a strict schema, applies deterministic JF tracking rules, creates the canonical UTM URL, shortens it with Bitly, optionally creates a QR code URL, and posts the result back into the same Chat channel.

## Stack

- Node.js 25+
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
5. Applies deterministic client, channel, alias, campaign, and UTM rules in Node.
6. Reuses an existing short link when the normalized fingerprint already exists.
7. Calls Bitly when a new short link is needed.
8. Generates a QR image URL when the request implies offline or QR usage.
9. Posts the result back into the same ClickUp Chat channel or thread.

## Project Structure

```text
ndoejsapp/
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

- Node.js 25+
- OpenAI API key
- ClickUp API token
- Bitly access token

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

1. Deploy the `ndoejsapp/` folder to the server.
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
- `CLICKUP_SIGNATURE_HEADER`
- `CLICKUP_CHAT_MESSAGE_CONTENT_FIELD`
- `CLICKUP_CHAT_MESSAGE_FALLBACK_FIELD`

## Endpoints

- `GET /health`
- `GET /debug/sample-payload`
  - only when `APP_DEBUG=true`
- `POST /webhooks/clickup/chat`

## ClickUp Payload Mapping

ClickUp Chat webhook payloads can vary. The mapping is isolated in [`src/services/clickup-payload-mapper.js`](/c:/Users/AminHcinet/Documents/jf-utm-bitly-generator/ndoejsapp/src/services/clickup-payload-mapper.js), and the sample fixture lives at [`tests/fixtures/clickup-chat-webhook.json`](/c:/Users/AminHcinet/Documents/jf-utm-bitly-generator/ndoejsapp/tests/fixtures/clickup-chat-webhook.json).

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

## Testing

Run:

```bash
node ./tests/run.js
```

Covered cases:

- alias normalization
- campaign slug generation
- UTM generation with existing query params
- duplicate fingerprint generation
- clarification branching
- unsupported client/channel handling

## Manual Testing Assets

- Sample payload: [`tests/fixtures/clickup-chat-webhook.json`](/c:/Users/AminHcinet/Documents/jf-utm-bitly-generator/ndoejsapp/tests/fixtures/clickup-chat-webhook.json)
- Curl examples: [`docs/CURL_EXAMPLES.md`](/c:/Users/AminHcinet/Documents/jf-utm-bitly-generator/ndoejsapp/docs/CURL_EXAMPLES.md)
- Postman collection: [`docs/postman_collection.json`](/c:/Users/AminHcinet/Documents/jf-utm-bitly-generator/ndoejsapp/docs/postman_collection.json)

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

- [`CLICKUP_SETUP.md`](/c:/Users/AminHcinet/Documents/jf-utm-bitly-generator/ndoejsapp/CLICKUP_SETUP.md)
- [`TEAM_USAGE.md`](/c:/Users/AminHcinet/Documents/jf-utm-bitly-generator/ndoejsapp/TEAM_USAGE.md)
- [`RULES_CONFIG.md`](/c:/Users/AminHcinet/Documents/jf-utm-bitly-generator/ndoejsapp/RULES_CONFIG.md)
- [`PERFECTION_IDEAS.md`](/c:/Users/AminHcinet/Documents/jf-utm-bitly-generator/ndoejsapp/PERFECTION_IDEAS.md)

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
