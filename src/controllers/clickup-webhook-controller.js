import crypto from "node:crypto";
import { NodeResponse } from "../http/response.js";

export class ClickUpWebhookController {
  constructor({
    payloadMapper,
    webhookVerifier,
    requestRepository,
    auditLogRepository,
    workflowService,
    logger
  }) {
    this.payloadMapper = payloadMapper;
    this.webhookVerifier = webhookVerifier;
    this.requestRepository = requestRepository;
    this.auditLogRepository = auditLogRepository;
    this.workflowService = workflowService;
    this.logger = logger;
  }

  async handle(request) {
    try {
      const payload = request.json();
      if (!payload || Object.keys(payload).length === 0) {
        throw new Error("Expected a JSON payload.");
      }

      const event = this.payloadMapper.map(payload);
      const verificationErrors = this.webhookVerifier.verify(request, event);
      if (verificationErrors.length > 0) {
        return NodeResponse.json({
          status: "rejected",
          errors: verificationErrors
        }, 403);
      }

      if (this.webhookVerifier.shouldIgnore(event)) {
        return NodeResponse.json({
          status: "ignored",
          reason: "configured_ignore_user"
        });
      }

      const existing = this.requestRepository.findByDeliveryKey(event.deliveryKey);
      if (existing) {
        return NodeResponse.json({
          status: "duplicate",
          request_id: Number(existing.id),
          delivery_key: event.deliveryKey
        });
      }

      const timestamp = new Date().toISOString();
      const requestId = this.requestRepository.createIncoming({
        requestUuid: crypto.randomUUID(),
        deliveryKey: event.deliveryKey,
        status: "received",
        originalMessage: event.messageText,
        rawPayload: event.rawPayload,
        clickupWorkspaceId: event.workspaceId,
        clickupChannelId: event.channelId,
        clickupMessageId: event.messageId,
        clickupThreadMessageId: event.threadMessageId,
        sourceUserId: event.userId ?? "anonymous",
        sourceUserName: event.userName ?? null,
        createdAt: timestamp,
        updatedAt: timestamp
      });

      this.auditLogRepository.log(requestId, "info", "request_received", "Webhook payload accepted.", event.toJSON());

      setImmediate(() => {
        this.workflowService.process(requestId, event).catch((error) => {
          this.logger.error("Deferred workflow execution failed.", {
            requestId,
            error: error.message
          });
        });
      });

      return NodeResponse.json({
        status: "accepted",
        request_id: requestId,
        delivery_key: event.deliveryKey
      }, 202);
    } catch (error) {
      this.logger.error("Unable to accept webhook request.", {
        error: error.message
      });

      return NodeResponse.json({
        status: "error",
        message: error.message
      }, 400);
    }
  }
}
