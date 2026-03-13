# Curl Examples

## Health Check

```bash
curl http://127.0.0.1:3000/health
```

## Debug Sample Payload

```bash
curl http://127.0.0.1:3000/debug/sample-payload
```

## Local ClickUp Webhook Test

Use the same shared secret value in both:

- request header `X-Signature`
- `.env` as `CLICKUP_WEBHOOK_SECRET`

```bash
curl -X POST http://127.0.0.1:3000/webhooks/clickup/chat \
  -H "Content-Type: application/json" \
  -H "X-Signature: your-shared-secret" \
  --data-binary "@tests/fixtures/clickup-chat-webhook.json"
```

## Windows PowerShell Version

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3000/webhooks/clickup/chat `
  -Headers @{ "X-Signature" = "your-shared-secret" } `
  -ContentType "application/json" `
  -InFile tests/fixtures/clickup-chat-webhook.json
```
