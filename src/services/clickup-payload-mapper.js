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
    const requestQuery = context.requestQuery ?? {};
    const sources = [{ label: "payload", value: payload }, { label: "query", value: requestQuery }];
    const messageText = this.resolveMessageText(sources);
    const workspaceId = this.resolveScalar(sources, [
      "workspace_id",
      "team_id",
      "payload.workspace_id",
      "workspace.id",
      "workspaceId"
    ], ["workspace_id", "workspaceId", "team_id", "teamId"]);

    const channelId = this.resolveScalar(sources, [
      "channel_id",
      "payload.channel_id",
      "payload.channelId",
      "context.channel_id",
      "channel.id",
      "chat.channel.id",
      "channelId"
    ], ["channel_id", "channelId"]);

    const messageId = this.resolveScalar(sources, [
      "message.id",
      "payload.message.id",
      "payload.comment_id",
      "payload.commentId",
      "event_data.message.id",
      "history_items.0.id",
      "message_id",
      "comment_id",
      "commentId"
    ], ["message_id", "messageId", "comment_id", "commentId", "id"]);

    const threadMessageId = this.resolveScalar(sources, [
      "message.thread_id",
      "payload.message.thread_id",
      "payload.reply_to_comment_id",
      "reply_to_message_id",
      "reply_to_comment_id",
      "thread.id"
    ], ["thread_id", "threadId", "reply_to_message_id", "replyToMessageId", "reply_to_comment_id", "replyToCommentId"]);

    const userId = this.resolveScalar(sources, [
      "message.user.id",
      "payload.message.user.id",
      "user.id",
      "author.id"
    ], ["user_id", "userId", "author_id", "authorId"]);

    const userName = this.resolveScalar(sources, [
      "message.user.username",
      "message.user.name",
      "payload.message.user.username",
      "user.username",
      "user.name",
      "author.username"
    ], ["username", "user_name", "userName", "name", "author_username", "authorUsername"]);

    const eventType = this.resolveScalar(sources, [
      "event",
      "trigger.event",
      "payload.event"
    ], ["event", "eventType"]);

    const webhookId = this.resolveScalar(sources, [
      "webhook_id",
      "payload.webhook_id"
    ], ["webhook_id", "webhookId"]);

    const payloadShape = inferPayloadShape(messageText.path ?? channelId.path ?? workspaceId.path);
    const diagnostics = {
      correlationId,
      payloadShape,
      topLevelKeys: Object.keys(payload ?? {}).slice(0, 20),
      queryKeys: Object.keys(requestQuery ?? {}).slice(0, 20),
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

    const deliveryKey = buildDeliveryKey({
      webhookId: webhookId.value,
      messageId: messageId.value,
      threadMessageId: threadMessageId.value,
      channelId: channelId.value ?? this.config.defaultChannelId ?? "",
      messageText: messageText.value.trim(),
      rawPayload: payload
    });

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

  resolveMessageText(sources) {
    const exact = this.firstMatch(sources, [
      "message.text",
      "message.content",
      "message.body",
      "message.text_content",
      "payload.text",
      "payload.content",
      "payload.text_content",
      "payload.message.text",
      "payload.message.content",
      "payload.message.text_content",
      "event_data.message.text",
      "content",
      "text",
      "text_content",
      "history_items.0.after.comment_text"
    ]);
    if (exact.value) {
      return exact;
    }

    const keyed = this.findFirstStringByKeys(sources, [
      "text",
      "text_content",
      "textContent",
      "content",
      "body",
      "comment_text",
      "commentText",
      "message_text",
      "messageText",
      "prompt"
    ]);
    if (keyed.value) {
      return keyed;
    }

    return this.findLikelyRequestText(sources);
  }

  resolveScalar(sources, exactPaths, preferredKeys = []) {
    const exact = this.firstMatch(sources, exactPaths);
    if (exact.value) {
      return exact;
    }

    if (preferredKeys.length === 0) {
      return exact;
    }

    return this.findFirstStringByKeys(sources, preferredKeys);
  }

  firstMatch(sources, paths) {
    for (const source of sources) {
      for (const path of paths) {
        const value = get(source.value, path);
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          return {
            value: String(value),
            path: source.label === "payload" ? path : `${source.label}.${path}`
          };
        }
      }
    }

    return {
      value: null,
      path: null
    };
  }

  findFirstStringByKeys(sources, keys) {
    const normalizedKeys = new Set(keys.map((key) => normalizeKey(key)));
    for (const source of sources) {
      const match = this.walkObject(source.value, ({ key, value, path }) => {
        if (!key || !isMeaningfulScalar(value)) {
          return false;
        }

        return normalizedKeys.has(normalizeKey(key));
      });

      if (match) {
        return {
          value: String(match.value),
          path: source.label === "payload" ? match.path : `${source.label}.${match.path}`
        };
      }
    }

    return {
      value: null,
      path: null
    };
  }

  findLikelyRequestText(sources) {
    for (const source of sources) {
      const match = this.walkObject(source.value, ({ value }) => {
        if (!isMeaningfulScalar(value)) {
          return false;
        }

        const text = String(value).trim();
        return /https?:\/\//iu.test(text) || /\blink\b|\butm\b|\bcampaign\b/iu.test(text);
      });

      if (match) {
        return {
          value: String(match.value),
          path: source.label === "payload" ? match.path : `${source.label}.${match.path}`
        };
      }
    }

    return {
      value: null,
      path: null
    };
  }

  walkObject(value, predicate, path = "") {
    if (value === null || value === undefined) {
      return null;
    }

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const childPath = path ? `${path}.${index}` : String(index);
        const match = this.walkObject(value[index], predicate, childPath);
        if (match) {
          return match;
        }
      }
      return null;
    }

    if (typeof value !== "object") {
      return null;
    }

    for (const [key, childValue] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (predicate({ key, value: childValue, path: childPath })) {
        return {
          key,
          value: childValue,
          path: childPath
        };
      }

      const nested = this.walkObject(childValue, predicate, childPath);
      if (nested) {
        return nested;
      }
    }

    return null;
  }
}

function normalizeKey(value) {
  return String(value ?? "").replace(/[^a-z0-9]/giu, "").toLowerCase();
}

function isMeaningfulScalar(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "object") {
    return false;
  }

  return String(value).trim() !== "";
}

function buildDeliveryKey({
  webhookId,
  messageId,
  threadMessageId,
  channelId,
  messageText,
  rawPayload
}) {
  const stableIdentifiers = [webhookId, messageId, threadMessageId].filter(Boolean);
  const payloadHash = crypto.createHash("sha1")
    .update(stableStringify(rawPayload))
    .digest("hex");
  const trailingHash = stableIdentifiers.length > 0
    ? crypto.createHash("sha1").update(messageText).digest("hex")
    : payloadHash;

  return [
    ...stableIdentifiers,
    channelId,
    trailingHash
  ]
    .filter(Boolean)
    .join(":");
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .reduce((accumulator, key) => {
        accumulator[key] = sortValue(value[key]);
        return accumulator;
      }, {});
  }

  return value;
}
