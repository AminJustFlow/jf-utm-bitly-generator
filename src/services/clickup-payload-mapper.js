import crypto from "node:crypto";
import { ClickUpWebhookEvent } from "../domain/clickup-webhook-event.js";
import { get } from "../support/arr.js";

export class ClickUpPayloadMapper {
  constructor(config) {
    this.config = config;
  }

  map(payload) {
    const messageText = this.firstString(payload, [
      "message.text",
      "message.content",
      "message.body",
      "payload.message.text",
      "payload.message.content",
      "event_data.message.text",
      "content",
      "text",
      "history_items.0.after.comment_text"
    ]);

    if (!messageText?.trim()) {
      throw new Error("Unable to determine the inbound ClickUp message text.");
    }

    const workspaceId = this.firstString(payload, [
      "workspace_id",
      "team_id",
      "payload.workspace_id",
      "workspace.id"
    ]) ?? this.config.workspaceId ?? "";

    const channelId = this.firstString(payload, [
      "channel_id",
      "payload.channel_id",
      "context.channel_id",
      "channel.id",
      "chat.channel.id"
    ]) ?? this.config.defaultChannelId ?? "";

    if (!channelId) {
      throw new Error("Unable to determine the ClickUp channel id.");
    }

    const messageId = this.firstString(payload, [
      "message.id",
      "payload.message.id",
      "event_data.message.id",
      "history_items.0.id",
      "message_id"
    ]);

    const threadMessageId = this.firstString(payload, [
      "message.thread_id",
      "payload.message.thread_id",
      "reply_to_message_id",
      "thread.id"
    ]);

    const userId = this.firstString(payload, [
      "message.user.id",
      "payload.message.user.id",
      "user.id",
      "author.id"
    ]);

    const userName = this.firstString(payload, [
      "message.user.username",
      "message.user.name",
      "payload.message.user.username",
      "user.username",
      "user.name",
      "author.username"
    ]);

    const eventType = this.firstString(payload, [
      "event",
      "trigger.event",
      "payload.event"
    ]) ?? "chatMessageCreated";

    const webhookId = this.firstString(payload, [
      "webhook_id",
      "payload.webhook_id"
    ]);

    const deliveryKey = [webhookId, messageId, channelId, crypto.createHash("sha1").update(messageText.trim()).digest("hex")]
      .filter(Boolean)
      .join(":");

    return new ClickUpWebhookEvent({
      deliveryKey,
      workspaceId,
      channelId,
      messageId,
      threadMessageId,
      userId,
      userName,
      messageText: messageText.trim(),
      eventType,
      rawPayload: payload
    });
  }

  firstString(payload, paths) {
    for (const path of paths) {
      const value = get(payload, path);
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value);
      }
    }

    return null;
  }
}
