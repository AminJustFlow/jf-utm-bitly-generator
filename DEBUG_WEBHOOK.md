# Debug Webhook

Use these tools only while troubleshooting ClickUp webhook delivery. Turn them off after the issue is understood.

## 1. Enable Debug Mode

Set these in `.env` on the server:

```env
APP_DEBUG=false
DEBUG_WEBHOOK=true
DEBUG_WEBHOOK_SKIP_SIGNATURE=false
DEBUG_WEBHOOK_SKIP_CHANNEL_CHECK=false
DEBUG_WEBHOOK_SKIP_WORKSPACE_CHECK=false
```

Temporary bypasses for manual testing:

- `DEBUG_WEBHOOK_SKIP_SIGNATURE=true`
- `DEBUG_WEBHOOK_SKIP_CHANNEL_CHECK=true`
- `DEBUG_WEBHOOK_SKIP_WORKSPACE_CHECK=true`

These bypasses are for short-lived troubleshooting only.

## 2. Restart And Inspect Logs

```bash
pm2 restart jf-link-generator
pm2 logs jf-link-generator --lines 200
pm2 status
```

If you run the app directly with Node instead of PM2:

```bash
npm run start
```

## 3. Debug Endpoints

Available only when `APP_DEBUG=true` or `DEBUG_WEBHOOK=true`.

- `GET /debug/webhook-info`
- `POST /debug/webhook-echo`
- `GET /debug/sample-payload`

Examples:

```bash
curl http://127.0.0.1:3000/debug/webhook-info
curl http://127.0.0.1:3000/debug/sample-payload
curl http://127.0.0.1:3000/debug/sample-payload?fixture=clickup-test-webhook.json
```

## 4. Test With curl

Local endpoint:

```bash
curl -X POST http://127.0.0.1:3000/webhooks/clickup/chat \
  -H "Content-Type: application/json" \
  -H "X-Signature: test-secret" \
  -d @tests/fixtures/clickup-chat-message.json
```

Public endpoint:

```bash
curl -X POST http://52.4.88.32/webhooks/clickup/chat \
  -H "Content-Type: application/json" \
  -H "X-Signature: test-secret" \
  -d @tests/fixtures/clickup-chat-message.json
```

Webhook echo endpoint:

```bash
curl -X POST http://127.0.0.1:3000/debug/webhook-echo \
  -H "Content-Type: application/json" \
  -d @tests/fixtures/clickup-chat-message.json
```

If you need to test without a signature:

```bash
curl -X POST http://127.0.0.1:3000/webhooks/clickup/chat \
  -H "Content-Type: application/json" \
  -d @tests/fixtures/clickup-chat-message.json
```

Only do that while `DEBUG_WEBHOOK_SKIP_SIGNATURE=true`.

Automation-style payload test with ClickUp-style query params:

```bash
curl -X POST "http://127.0.0.1:3000/webhooks/clickup/chat?channel_id=456789&comment_id=comment-123" \
  -H "Content-Type: application/json" \
  -H "X-Signature: test-secret" \
  -d "{\"payload\":{\"workspace_id\":\"901234\",\"text_content\":\"Need a LinkedIn link for Studleys spring sale to https://studleys.com/garden-plants/\"}}"
```

## 5. Test With Postman

1. Create a new `POST` request.
2. Set the URL to `http://127.0.0.1:3000/webhooks/clickup/chat`.
3. Add header `Content-Type: application/json`.
4. Add header `X-Signature: test-secret`.
5. In `Body`, choose `raw` and `JSON`.
6. Paste the contents of `tests/fixtures/clickup-chat-message.json`.
7. Send the request.
8. Copy the returned `correlation_id`.
9. Check `pm2 logs jf-link-generator --lines 200` for the same correlation id.

For payload inspection without business logic, send the same request to:

`http://127.0.0.1:3000/debug/webhook-echo`

## 6. Replay Fixtures With npm

Default replay:

```bash
npm run debug:webhook
```

Specific fixture:

```bash
npm run debug:webhook -- --fixture=tests/fixtures/clickup-chat-message.json
```

Best-effort generic test webhook:

```bash
npm run debug:webhook -- --fixture=tests/fixtures/clickup-test-webhook.json
```

Skip signature header while using the server-side debug bypass:

```bash
npm run debug:webhook -- --fixture=tests/fixtures/clickup-chat-message.json --skip-signature
```

Custom public URL:

```bash
npm run debug:webhook -- --url=http://52.4.88.32/webhooks/clickup/chat --signature=test-secret
```

## 7. Fixtures

- `tests/fixtures/clickup-chat-message.json`
  - best-effort example of a real chat message event
- `tests/fixtures/clickup-test-webhook.json`
  - best-effort example of a generic ClickUp test webhook

If your workspace sends a different shape:

1. enable `DEBUG_WEBHOOK=true`
2. hit `/debug/webhook-echo`
3. capture the real payload
4. replace the fixture contents with the real payload for future testing

## 8. Compare Test Webhook Vs Real Chat Message

The real chat message payload should include:

- message text or content
- channel id
- workspace id
- message id

The generic ClickUp test webhook may not include full message content. If that happens, the mapper now returns explicit codes like:

- `missing_message_text`
- `missing_channel_id`
- `unsupported_payload_shape`

For Chat Automation debugging, compare all three places:

- request query string
- top-level JSON fields
- nested `payload.*` fields

## 9. Turn Debug Back Off

After troubleshooting:

```env
DEBUG_WEBHOOK=false
DEBUG_WEBHOOK_SKIP_SIGNATURE=false
DEBUG_WEBHOOK_SKIP_CHANNEL_CHECK=false
DEBUG_WEBHOOK_SKIP_WORKSPACE_CHECK=false
APP_DEBUG=false
```

Then restart:

```bash
pm2 restart jf-link-generator
```
