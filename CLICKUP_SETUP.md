# ClickUp Setup

Use a dedicated ClickUp Chat channel and a channel-specific webhook Automation for this bot.

## 1. Create the Dedicated Chat Channel

Recommended name:

- `jf-link-generator`

Recommended visibility:

- private or restricted to the team members who actually need links

In ClickUp:

1. Open `Chat`.
2. Create a new channel.
3. Name it `jf-link-generator`.
4. Add the relevant marketing and ops teammates.
5. Pin a short usage example.

## 2. Pick the Automation Owner

Use a shared service account instead of a personal account.

That account should own:

- the Chat Automation
- the ClickUp API token
- the bot reply identity

## 3. Create the Chat Webhook Automation

Inside `#jf-link-generator`:

1. Open the channel.
2. Click `Automations`.
3. Create a new channel Automation.
4. Choose the Chat trigger for a new message in the channel.
5. Choose the `Webhook` action.
6. Set the method to `POST`.
7. Set the URL to:

   ```text
   https://your-app.example.com/webhooks/clickup/chat
   ```

   Recommended while using ClickUp Chat Automation dynamic fields:

   ```text
   https://your-app.example.com/webhooks/clickup/chat?channel_id={{channel_id}}&comment_id={{comment_id}}
   ```

8. Add this header:

   ```text
   X-Signature: your-shared-secret
   ```

9. Set the same value in `.env`:

   ```text
   CLICKUP_WEBHOOK_SECRET=your-shared-secret
   ```

## 4. Capture the Right IDs

You need:

- `CLICKUP_WORKSPACE_ID`
- `CLICKUP_CHAT_CHANNEL_ID`
- `CLICKUP_ALLOWED_CHANNEL_IDS`

Best way to capture the channel id:

1. Trigger the webhook once.
2. Inspect the stored raw payload.
3. Copy `channel_id` into the environment variables.

## 5. Prevent Bot Loops

Because the bot posts replies back into the same channel, its own replies can retrigger the Automation.

To avoid that:

1. Send one real reply using the bot credentials.
2. Capture the bot user id or username from the stored payload.
3. Put it in:
   - `CLICKUP_IGNORE_USER_IDS`
   - or `CLICKUP_IGNORE_USERNAMES`

## 6. Recommended Test Process

1. Start the Node app.
2. Verify `GET /health`.
3. Enable the ClickUp Automation.
4. Post this exact message:

   ```text
   Need an Instagram link for Studleys spring sale to https://studleys.com/perennials
   ```

5. Confirm the bot replies in-channel with:
   - client
   - channel
   - canonical campaign
   - UTM URL
   - short link
6. Post the same message again.
7. Confirm the bot says it reused the existing short link.

## 7. Practical Gotchas

- ClickUp Chat payload shape may vary by workspace. If needed, update [`src/services/clickup-payload-mapper.js`](/c:/Users/AminHcinet/Documents/jf-utm-bitly-generator/ndoejsapp/src/services/clickup-payload-mapper.js).
- The mapper now accepts message text from `payload.text_content`, `payload.content`, `payload.message.text`, and similar variants.
- The mapper now accepts `channel_id` and `comment_id` from webhook query params if you add them as ClickUp dynamic URL fields.
- If outbound message posting returns `400`, verify the correct content field for your ClickUp Chat API response shape.
- Keep the channel dedicated to link requests. Side conversations reduce parser confidence and pollute analytics.
