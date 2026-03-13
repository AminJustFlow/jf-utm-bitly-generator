export class LinkWorkflowService {
  constructor({
    requestRepository,
    auditLogRepository,
    rateLimiter,
    linkRequestParser,
    requestNormalizer,
    fingerprintService,
    linkGenerationService,
    clickUpChatService,
    messageFormatter,
    logger
  }) {
    this.requestRepository = requestRepository;
    this.auditLogRepository = auditLogRepository;
    this.rateLimiter = rateLimiter;
    this.linkRequestParser = linkRequestParser;
    this.requestNormalizer = requestNormalizer;
    this.fingerprintService = fingerprintService;
    this.linkGenerationService = linkGenerationService;
    this.clickUpChatService = clickUpChatService;
    this.messageFormatter = messageFormatter;
    this.logger = logger;
  }

  async process(requestId, event, context = {}) {
    const correlationId = context.correlationId ?? null;
    try {
      this.auditLogRepository.log(requestId, "info", "processing_started", "Processing inbound ClickUp message.", {
        correlationId,
        ...event.toJSON()
      });

      if (!this.rateLimiter.allows(event)) {
        await this.clickUpChatService.postMessage(event.channelId, this.messageFormatter.formatRateLimit(), event.threadMessageId);
        this.requestRepository.update(requestId, { status: "rate_limited" });
        return;
      }

      const parsed = await this.linkRequestParser.parse(event.messageText);
      this.requestRepository.update(requestId, {
        status: "parsed",
        parsed_payload: parsed.toJSON(),
        warnings: parsed.warnings,
        missing_fields: parsed.missingFields,
        openai_request_id: parsed.metadata.responseId ?? null,
        openai_model: parsed.metadata.model ?? null
      });

      const decision = this.requestNormalizer.normalize(parsed);
      if (decision.status === "clarify" || !decision.normalizedRequest) {
        const response = await this.clickUpChatService.postMessage(
          event.channelId,
          this.messageFormatter.formatClarification(decision.message),
          event.threadMessageId
        );

        this.requestRepository.update(requestId, {
          status: "clarification_sent",
          warnings: decision.warnings,
          missing_fields: decision.missingFields,
          response_message_id: response.id ?? response.message?.id ?? null
        });
        return;
      }

      const normalized = decision.normalizedRequest;
      const fingerprint = this.fingerprintService.generate(normalized);
      this.requestRepository.update(requestId, {
        status: "normalized",
        normalized_payload: normalized.toJSON(),
        fingerprint,
        final_long_url: normalized.finalLongUrl
      });

      const generation = await this.linkGenerationService.generate(normalized, fingerprint);

      if (generation.degraded) {
        const degradedWarnings = [
          ...new Set([
            ...normalized.warnings,
            "Bitly monthly quota was reached, so no short link was created."
          ])
        ];
        normalized.warnings = degradedWarnings;

        const response = await this.clickUpChatService.postMessage(
          event.channelId,
          this.messageFormatter.formatSuccess(normalized, generation.result),
          event.threadMessageId
        );

        this.requestRepository.update(requestId, {
          status: "completed_without_short_link",
          normalized_payload: normalized.toJSON(),
          qr_url: generation.result.qrUrl,
          warnings: degradedWarnings,
          reused_existing: generation.result.reusedExisting ? 1 : 0,
          error_code: generation.degradedReason,
          error_message: generation.degradedMessage,
          response_message_id: response.id ?? response.message?.id ?? null
        });
        return;
      }

      const response = await this.clickUpChatService.postMessage(
        event.channelId,
        this.messageFormatter.formatSuccess(normalized, generation.result),
        event.threadMessageId
      );

      this.requestRepository.update(requestId, {
        status: "completed",
        short_url: generation.result.shortUrl,
        bitly_id: generation.bitlyId,
        bitly_payload: generation.bitlyPayload,
        qr_url: generation.result.qrUrl,
        reused_existing: generation.result.reusedExisting ? 1 : 0,
        response_message_id: response.id ?? response.message?.id ?? null
      });
    } catch (error) {
      this.logger.error("Link workflow failed.", {
        requestId,
        correlationId,
        deliveryKey: event.deliveryKey,
        error: error.message
      });

      this.auditLogRepository.log(requestId, "error", "workflow_failed", error.message, {
        correlationId
      });
      this.requestRepository.update(requestId, {
        status: "failed",
        error_code: "workflow_failed",
        error_message: error.message
      });

      try {
        await this.clickUpChatService.postMessage(event.channelId, this.messageFormatter.formatFailure(), event.threadMessageId);
      } catch (secondaryError) {
        this.logger.warning("Unable to post failure response to ClickUp.", {
          requestId,
          correlationId,
          error: secondaryError.message
        });
      }
    }
  }

}
