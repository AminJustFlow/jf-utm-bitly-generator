import crypto from "node:crypto";
import { ClickUpWebhookEvent } from "../domain/clickup-webhook-event.js";

export class ReceivedRequestRecoveryService {
  constructor({
    requestRepository,
    auditLogRepository,
    workflowService,
    logger,
    enabled = true,
    intervalMs = 30000,
    graceSeconds = 30,
    batchSize = 25
  }) {
    this.requestRepository = requestRepository;
    this.auditLogRepository = auditLogRepository;
    this.workflowService = workflowService;
    this.logger = logger;
    this.enabled = Boolean(enabled);
    this.intervalMs = Math.max(1000, Number(intervalMs ?? 30000));
    this.graceSeconds = Math.max(5, Number(graceSeconds ?? 30));
    this.batchSize = Math.max(1, Number(batchSize ?? 25));
    this.timer = null;
    this.running = false;
  }

  start() {
    if (!this.enabled || this.timer) {
      return;
    }

    setImmediate(() => {
      this.recoverPending().catch((error) => {
        this.logger.error("Received-request recovery failed during startup.", {
          error: error.message
        });
      });
    });

    this.timer = setInterval(() => {
      this.recoverPending().catch((error) => {
        this.logger.error("Received-request recovery failed.", {
          error: error.message
        });
      });
    }, this.intervalMs);

    if (typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  stop() {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  async recoverPending() {
    if (!this.enabled || this.running) {
      return;
    }

    this.running = true;

    try {
      const beforeIso = new Date(Date.now() - (this.graceSeconds * 1000)).toISOString();
      const candidates = this.requestRepository.listReceivedBefore(beforeIso, this.batchSize);

      for (const row of candidates) {
        const requestId = Number(row.id);
        if (!this.requestRepository.claimRecovery(requestId)) {
          continue;
        }

        const correlationId = `recovery-${crypto.randomUUID()}`;
        let event;

        try {
          event = this.rebuildEvent(row);
        } catch (error) {
          this.logger.error("Unable to rebuild a received request for recovery.", {
            requestId,
            correlationId,
            error: error.message
          });
          this.requestRepository.update(requestId, {
            status: "failed",
            error_code: "recovery_rebuild_failed",
            error_message: error.message
          });
          continue;
        }

        this.auditLogRepository.log(
          requestId,
          "info",
          "request_recovery_started",
          "Recovering a pending received request.",
          {
            correlationId,
            deliveryKey: event.deliveryKey
          }
        );

        await this.workflowService.process(requestId, event, {
          correlationId,
          recovered: true
        });
      }
    } finally {
      this.running = false;
    }
  }

  rebuildEvent(row) {
    const messageText = String(row.original_message ?? "").trim();
    const channelId = String(row.clickup_channel_id ?? "").trim();

    if (!messageText) {
      throw new Error("Recovered request is missing the original message text.");
    }

    if (!channelId) {
      throw new Error("Recovered request is missing the ClickUp channel id.");
    }

    return new ClickUpWebhookEvent({
      deliveryKey: String(row.delivery_key ?? ""),
      workspaceId: String(row.clickup_workspace_id ?? ""),
      channelId,
      messageId: row.clickup_message_id ?? null,
      threadMessageId: row.clickup_thread_message_id ?? null,
      userId: row.source_user_id ?? null,
      userName: row.source_user_name ?? null,
      messageText,
      eventType: "recoveredPendingRequest",
      rawPayload: parseObject(row.raw_payload)
    });
  }
}

function parseObject(value) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
