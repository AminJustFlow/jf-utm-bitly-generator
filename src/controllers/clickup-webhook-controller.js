import crypto from "node:crypto";
import { NodeResponse } from "../http/response.js";
import { WebhookError } from "../support/webhook-error.js";
import { maskHeaders, previewRawBody } from "../support/webhook-debug.js";

export class ClickUpWebhookController {
  constructor({
    payloadMapper,
    webhookVerifier,
    requestRepository,
    auditLogRepository,
    workflowService,
    logger,
    debugEnabled = false
  }) {
    this.payloadMapper = payloadMapper;
    this.webhookVerifier = webhookVerifier;
    this.requestRepository = requestRepository;
    this.auditLogRepository = auditLogRepository;
    this.workflowService = workflowService;
    this.logger = logger;
    this.debugEnabled = debugEnabled;
  }

  async handle(request) {
    const correlationId = request.header("x-request-id")?.trim() || crypto.randomUUID();
    const baseContext = {
      correlationId,
      method: request.method,
      path: request.path
    };

    try {
      const parsedBody = request.parseJson();
      this.logger.info("ClickUp webhook request received.", {
        ...baseContext,
        requestQuery: request.query,
        bodyPresent: Boolean(String(request.rawBody ?? "").trim())
      });

      if (this.debugEnabled) {
        this.logger.debug("ClickUp webhook request details.", {
          ...baseContext,
          requestHeaders: maskHeaders(request.headers),
          requestQuery: request.query,
          requestBody: parsedBody.ok ? parsedBody.value : null,
          rawBody: previewRawBody(request.rawBody)
        });
      }

      if (!parsedBody.ok) {
        return this.respondFailure({
          statusCode: 400,
          status: "error",
          code: parsedBody.errorCode,
          message: parsedBody.errorMessage,
          correlationId,
          details: {
            parseError: parsedBody.parseError ?? null
          }
        });
      }

      const payload = parsedBody.value;
      if (Object.keys(payload).length === 0) {
        return this.respondFailure({
          statusCode: 400,
          status: "error",
          code: "missing_body",
          message: "Expected a JSON payload.",
          correlationId
        });
      }

      let mapped;
      try {
        mapped = this.payloadMapper.map(payload, { correlationId });
      } catch (error) {
        if (error instanceof WebhookError) {
          return this.respondFailure({
            statusCode: error.statusCode,
            status: "error",
            code: error.code,
            message: error.message,
            correlationId,
            details: error.details
          });
        }

        this.logger.error("ClickUp payload mapper failed unexpectedly.", {
          ...baseContext,
          reason: "mapper_failed",
          error: error.message
        });
        return this.respondFailure({
          statusCode: 400,
          status: "error",
          code: "mapper_failed",
          message: "Unable to map the ClickUp payload.",
          correlationId
        });
      }

      const { event, diagnostics } = mapped;
      this.logger.info("ClickUp webhook payload mapped.", {
        ...baseContext,
        payloadShape: diagnostics.payloadShape,
        messageTextFound: diagnostics.messageTextFound,
        workspaceIdFoundInPayload: diagnostics.workspaceIdFoundInPayload,
        channelIdFoundInPayload: diagnostics.channelIdFoundInPayload,
        workspaceIdResolved: diagnostics.workspaceIdResolved,
        channelIdResolved: diagnostics.channelIdResolved
      });

      const verification = this.webhookVerifier.verify(request, event, diagnostics, { correlationId });
      if (!verification.passed) {
        return this.respondFailure({
          statusCode: 403,
          status: "rejected",
          code: verification.reasons.length === 1 ? verification.reasons[0].code : "verification_failed",
          message: verification.reasons.length === 1
            ? verification.reasons[0].message
            : "ClickUp webhook verification failed.",
          correlationId,
          details: verification.diagnostics
        });
      }

      if (this.webhookVerifier.shouldIgnore(event)) {
        this.logger.info("ClickUp webhook ignored by configured user filter.", {
          ...baseContext,
          userId: event.userId,
          userName: event.userName
        });
        return NodeResponse.json({
          status: "ignored",
          reason: "configured_ignore_user",
          correlation_id: correlationId
        }, 200, this.responseHeaders(correlationId));
      }

      const existing = this.requestRepository.findByDeliveryKey(event.deliveryKey);
      if (existing) {
        this.logger.info("ClickUp webhook request deduplicated.", {
          ...baseContext,
          requestId: Number(existing.id),
          deliveryKey: event.deliveryKey
        });
        return NodeResponse.json({
          status: "duplicate",
          request_id: Number(existing.id),
          delivery_key: event.deliveryKey,
          correlation_id: correlationId
        }, 200, this.responseHeaders(correlationId));
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

      this.auditLogRepository.log(requestId, "info", "request_received", "Webhook payload accepted.", {
        correlationId,
        ...event.toJSON()
      });

      setImmediate(() => {
        this.workflowService.process(requestId, event, { correlationId }).catch((error) => {
          this.logger.error("Deferred workflow execution failed.", {
            requestId,
            correlationId,
            error: error.message
          });
        });
      });

      return NodeResponse.json({
        status: "accepted",
        request_id: requestId,
        delivery_key: event.deliveryKey,
        correlation_id: correlationId
      }, 202, this.responseHeaders(correlationId));
    } catch (error) {
      if (error instanceof WebhookError) {
        return this.respondFailure({
          statusCode: error.statusCode,
          status: error.statusCode === 403 ? "rejected" : "error",
          code: error.code,
          message: error.message,
          correlationId,
          details: error.details
        });
      }

      this.logger.error("Unable to accept webhook request.", {
        ...baseContext,
        reason: "webhook_controller_failed",
        error: error.message
      });

      return this.respondFailure({
        statusCode: 500,
        status: "error",
        code: "webhook_controller_failed",
        message: "Unable to accept webhook request.",
        correlationId
      });
    }
  }

  respondFailure({ statusCode, status, code, message, correlationId, details = {} }) {
    const logMethod = statusCode >= 500 ? "error" : "warning";
    this.logger[logMethod]("ClickUp webhook request failed.", {
      correlationId,
      statusCode,
      reason: code,
      message,
      details
    });

    const payload = {
      status,
      correlation_id: correlationId
    };

    if (this.debugEnabled) {
      payload.error = {
        code,
        message
      };
      if (Object.keys(details).length > 0) {
        payload.error.details = details;
      }
    }

    return NodeResponse.json(payload, statusCode, this.responseHeaders(correlationId));
  }

  responseHeaders(correlationId) {
    return {
      "X-Correlation-Id": correlationId
    };
  }
}
