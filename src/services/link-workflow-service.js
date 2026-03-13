import { LinkGenerationResult } from "../domain/link-generation-result.js";
import { BitlyError } from "./bitly-service.js";

export class LinkWorkflowService {
  constructor({
    requestRepository,
    generatedLinkRepository,
    auditLogRepository,
    rateLimiter,
    linkRequestParser,
    requestNormalizer,
    fingerprintService,
    bitlyService,
    qrCodeService,
    clickUpChatService,
    messageFormatter,
    logger
  }) {
    this.requestRepository = requestRepository;
    this.generatedLinkRepository = generatedLinkRepository;
    this.auditLogRepository = auditLogRepository;
    this.rateLimiter = rateLimiter;
    this.linkRequestParser = linkRequestParser;
    this.requestNormalizer = requestNormalizer;
    this.fingerprintService = fingerprintService;
    this.bitlyService = bitlyService;
    this.qrCodeService = qrCodeService;
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

      const existing = this.generatedLinkRepository.findByFingerprint(fingerprint);
      if (existing) {
        const result = new LinkGenerationResult({
          fingerprint,
          longUrl: existing.final_long_url,
          shortUrl: existing.short_url,
          qrUrl: existing.qr_url ?? null,
          reusedExisting: true,
          bitlyMetadata: {}
        });

        const response = await this.clickUpChatService.postMessage(
          event.channelId,
          this.messageFormatter.formatSuccess(normalized, result),
          event.threadMessageId
        );

        this.requestRepository.update(requestId, {
          status: "completed",
          short_url: existing.short_url,
          qr_url: existing.qr_url ?? null,
          reused_existing: 1,
          response_message_id: response.id ?? response.message?.id ?? null
        });
        return;
      }

      let bitly;
      let qrUrl = null;
      let result;
      const timestamp = new Date().toISOString();

      try {
        bitly = await this.bitlyService.shorten(normalized.finalLongUrl);
        qrUrl = normalized.needsQr ? this.qrCodeService.generateUrl(bitly.link || normalized.finalLongUrl) : null;
        this.generatedLinkRepository.create({
          fingerprint,
          client: normalized.client,
          channel: normalized.channel,
          assetType: normalized.assetType,
          normalizedDestinationUrl: normalized.normalizedDestinationUrl,
          canonicalCampaign: normalized.canonicalCampaign,
          finalLongUrl: normalized.finalLongUrl,
          shortUrl: bitly.link,
          qrUrl,
          bitlyId: bitly.id,
          bitlyPayload: bitly.payload,
          createdAt: timestamp,
          updatedAt: timestamp
        });
      } catch (error) {
        if (this.shouldDegradeBitlyFailure(error)) {
          const degradedWarnings = [
            ...new Set([
              ...normalized.warnings,
              "Bitly monthly quota was reached, so no short link was created."
            ])
          ];
          normalized.warnings = degradedWarnings;
          qrUrl = normalized.needsQr ? this.qrCodeService.generateUrl(normalized.finalLongUrl) : null;
          result = new LinkGenerationResult({
            fingerprint,
            longUrl: normalized.finalLongUrl,
            shortUrl: null,
            qrUrl,
            reusedExisting: false,
            bitlyMetadata: error.responseBody ?? {},
            shortLinkAvailable: false
          });

          const response = await this.clickUpChatService.postMessage(
            event.channelId,
            this.messageFormatter.formatSuccess(normalized, result),
            event.threadMessageId
          );

          this.requestRepository.update(requestId, {
            status: "completed_without_short_link",
            qr_url: qrUrl,
            warnings: degradedWarnings,
            error_code: "bitly_quota_reached",
            error_message: error.message,
            response_message_id: response.id ?? response.message?.id ?? null
          });
          return;
        }

        const raceExisting = this.generatedLinkRepository.findByFingerprint(fingerprint);
        if (!raceExisting) {
          throw error;
        }

        bitly.link = raceExisting.short_url;
        qrUrl = raceExisting.qr_url ?? (normalized.needsQr ? this.qrCodeService.generateUrl(bitly.link || normalized.finalLongUrl) : null);
      }

      result = new LinkGenerationResult({
        fingerprint,
        longUrl: normalized.finalLongUrl,
        shortUrl: bitly.link,
        qrUrl,
        reusedExisting: false,
        bitlyMetadata: bitly.payload
      });

      const response = await this.clickUpChatService.postMessage(
        event.channelId,
        this.messageFormatter.formatSuccess(normalized, result),
        event.threadMessageId
      );

      this.requestRepository.update(requestId, {
        status: "completed",
        short_url: bitly.link,
        bitly_id: bitly.id,
        bitly_payload: bitly.payload,
        qr_url: qrUrl,
        reused_existing: 0,
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

  shouldDegradeBitlyFailure(error) {
    return error instanceof BitlyError
      && error.statusCode === 429
      && error.code === "MONTHLY_ENCODE_LIMIT_REACHED";
  }
}
