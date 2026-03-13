import crypto from "node:crypto";
import { ClickUpWebhookEvent } from "../domain/clickup-webhook-event.js";
import { get } from "../support/arr.js";
import { WebhookError } from "../support/webhook-error.js";
import { inferPayloadShape } from "../support/webhook-debug.js";

export class ClickUpPayloadMapper {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  map(payload, context = {}) {
    const correlationId = context.correlationId ?? null;
    const messageText = this.firstMatch(payload, [
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

    const workspaceId = this.firstMatch(payload, [
      "workspace_id",
      "team_id",
      "payload.workspace_id",
      "workspace.id"
    ]);

    const channelId = this.firstMatch(payload, [
      "channel_id",
      "payload.channel_id",
      "context.channel_id",
      "channel.id",
      "chat.channel.id"
    ]);

    const messageId = this.firstMatch(payload, [
      "message.id",
      "payload.message.id",
      "event_data.message.id",
      "history_items.0.id",
      "message_id"
    ]);

    const threadMessageId = this.firstMatch(payload, [
      "message.thread_id",
      "payload.message.thread_id",
      "reply_to_message_id",
      "thread.id"
    ]);

    const userId = this.firstMatch(payload, [
      "message.user.id",
      "payload.message.user.id",
      "user.id",
      "author.id"
    ]);

    const userName = this.firstMatch(payload, [
      "message.user.username",
      "message.user.name",
      "payload.message.user.username",
      "user.username",
      "user.name",
      "author.username"
    ]);

    const eventType = this.firstMatch(payload, [
      "event",
      "trigger.event",
      "payload.event"
    ]);

    const webhookId = this.firstMatch(payload, [
      "webhook_id",
      "payload.webhook_id"
    ]);

    const payloadShape = inferPayloadShape(messageText.path ?? channelId.path ?? workspaceId.path);
    const diagnostics = {
      correlationId,
      payloadShape,
      matchedPaths: {
        messageText: messageText.path,
        workspaceId: workspaceId.path,
        channelId: channelId.path,
        messageId: messageId.path,
        threadMessageId: threadMessageId.path,
        userId: userId.path,
        userName: userName.path,
        eventType: eventType.path,
        webhookId: webhookId.path
      },
      messageTextFound: Boolean(messageText.value?.trim()),
      workspaceIdFoundInPayload: Boolean(workspaceId.value?.trim()),
      channelIdFoundInPayload: Boolean(channelId.value?.trim()),
      workspaceIdResolved: workspaceId.value ?? this.config.workspaceId ?? "",
      workspaceIdSource: workspaceId.path ?? (this.config.workspaceId ? "config.workspaceId" : null),
      channelIdResolved: channelId.value ?? this.config.defaultChannelId ?? "",
      channelIdSource: channelId.path ?? (this.config.defaultChannelId ? "config.defaultChannelId" : null)
    };

    if (this.config.debugWebhook) {
      this.logger.debug("ClickUp payload mapper evaluated payload.", diagnostics);
    }

    if (!messageText.value?.trim()) {
      const code = !workspaceId.path && !channelId.path && !messageId.path && !webhookId.path
        ? "unsupported_payload_shape"
        : "missing_message_text";
      this.logger.warning("ClickUp payload mapper failed.", {
        ...diagnostics,
        reason: code
      });
      throw new WebhookError(
        code,
        code === "unsupported_payload_shape"
          ? "Unsupported ClickUp payload shape."
          : "Unable to determine the inbound ClickUp message text.",
        400,
        diagnostics
      );
    }

    if (!(channelId.value ?? this.config.defaultChannelId ?? "").trim()) {
      this.logger.warning("ClickUp payload mapper failed.", {
        ...diagnostics,
        reason: "missing_channel_id"
      });
      throw new WebhookError(
        "missing_channel_id",
        "Unable to determine the ClickUp channel id.",
        400,
        diagnostics
      );
    }

    const deliveryKey = [
      webhookId.value,
      messageId.value,
      channelId.value ?? this.config.defaultChannelId ?? "",
      crypto.createHash("sha1").update(messageText.value.trim()).digest("hex")
    ]
      .filter(Boolean)
      .join(":");

    return {
      event: new ClickUpWebhookEvent({
        deliveryKey,
        workspaceId: workspaceId.value ?? this.config.workspaceId ?? "",
        channelId: channelId.value ?? this.config.defaultChannelId ?? "",
        messageId: messageId.value ?? null,
        threadMessageId: threadMessageId.value ?? null,
        userId: userId.value ?? null,
        userName: userName.value ?? null,
        messageText: messageText.value.trim(),
        eventType: eventType.value ?? "chatMessageCreated",
        rawPayload: payload
      }),
      diagnostics
    };
  }

  firstMatch(payload, paths) {
    for (const path of paths) {
      const value = get(payload, path);
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return {
          value: String(value),
          path
        };
      }
    }

    return {
      value: null,
      path: null
    };
  }
}
