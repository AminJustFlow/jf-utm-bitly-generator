import crypto from "node:crypto";
import { ParsedLinkRequest } from "../domain/parsed-link-request.js";

export class UtmLibraryEditorService {
  constructor({
    requestRepository,
    requestNormalizer,
    fingerprintService,
    linkGenerationService,
    generatedLinkRepository
  }) {
    this.requestRepository = requestRepository;
    this.requestNormalizer = requestNormalizer;
    this.fingerprintService = fingerprintService;
    this.linkGenerationService = linkGenerationService;
    this.generatedLinkRepository = generatedLinkRepository;
  }

  async regenerate(input = {}) {
    return this.submit(input, {
      requestSource: "utm_library_editor",
      sourceUserId: "utm_library",
      sourceUserName: "UTM Library",
      messageLabel: "Library editor update"
    });
  }

  async create(input = {}) {
    return this.submit(input, {
      requestSource: "utm_builder",
      sourceUserId: "utm_builder",
      sourceUserName: "UTM Builder",
      messageLabel: "Builder form submission"
    });
  }

  async deleteEntry(input = {}) {
    const requestId = positiveInteger(input.request_id ?? input.original_request_id, null);
    if (!requestId) {
      return {
        ok: false,
        statusCode: 422,
        code: "missing_request_id",
        message: "Select a valid UTM entry to remove."
      };
    }

    const existing = this.requestRepository.findById(requestId);
    if (!existing) {
      return {
        ok: false,
        statusCode: 404,
        code: "request_not_found",
        message: "That UTM entry no longer exists."
      };
    }

    const fingerprint = normalizeOptional(existing.fingerprint);
    const deletedRequests = fingerprint
      ? this.requestRepository.deleteByFingerprint(fingerprint)
      : this.requestRepository.deleteByRequestUuid(existing.request_uuid);

    if (fingerprint && this.requestRepository.countByFingerprint(fingerprint) === 0) {
      this.generatedLinkRepository.deleteByFingerprint(fingerprint);
    }

    return {
      ok: true,
      requestId,
      deletedRequests
    };
  }

  async submit(input = {}, context) {
    const parsed = ParsedLinkRequest.fromObject({
      client: normalizeOptional(input.client),
      channel: normalizeOptional(input.channel),
      campaign_label: normalizeOptional(input.campaign_label),
      utm_source: normalizeNullable(input.utm_source),
      utm_medium: normalizeNullable(input.utm_medium),
      utm_campaign: normalizeNullable(input.utm_campaign),
      utm_term: normalizeNullable(input.utm_term),
      utm_content: normalizeNullable(input.utm_content),
      destination_url: normalizeOptional(input.destination_url),
      needs_qr: Boolean(input.needs_qr),
      confidence: 1,
      warnings: [],
      missing_fields: []
    }, context.requestSource, {
      original_request_id: input.original_request_id ?? null
    });

    const decision = this.requestNormalizer.normalize(parsed);
    if (decision.status === "clarify" || !decision.normalizedRequest) {
      return {
        ok: false,
        statusCode: 422,
        code: "validation_failed",
        message: decision.message,
        warnings: decision.warnings,
        missingFields: decision.missingFields
      };
    }

    const normalized = decision.normalizedRequest;
    const fingerprint = this.fingerprintService.generate(normalized);
    const timestamp = new Date().toISOString();
    const requestId = this.requestRepository.createIncoming({
      requestUuid: crypto.randomUUID(),
      deliveryKey: `utm-library:${crypto.randomUUID()}`,
      status: "received",
      originalMessage: buildOriginalMessage(normalized, context.messageLabel, input.original_request_id),
      rawPayload: {
        source: context.requestSource,
        original_request_id: input.original_request_id ?? null,
        submitted_values: {
          client: input.client ?? null,
          channel: input.channel ?? null,
          campaign_label: input.campaign_label ?? null,
          utm_source: input.utm_source ?? null,
          utm_medium: input.utm_medium ?? null,
          utm_campaign: input.utm_campaign ?? null,
          utm_term: input.utm_term ?? null,
          utm_content: input.utm_content ?? null,
          destination_url: input.destination_url ?? null,
          needs_qr: Boolean(input.needs_qr)
        }
      },
      sourceUserId: context.sourceUserId,
      sourceUserName: context.sourceUserName,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    this.requestRepository.update(requestId, {
      status: "parsed",
      parsed_payload: parsed.toJSON(),
      warnings: parsed.warnings,
      missing_fields: parsed.missingFields
    });

    this.requestRepository.update(requestId, {
      status: "normalized",
      normalized_payload: normalized.toJSON(),
      fingerprint,
      final_long_url: normalized.finalLongUrl
    });

    try {
      const generation = await this.linkGenerationService.generate(normalized, fingerprint);

      if (generation.degraded) {
        const warnings = [
          ...new Set([
            ...normalized.warnings,
            "Bitly monthly quota was reached, so no short link was created."
          ])
        ];
        normalized.warnings = warnings;

        this.requestRepository.update(requestId, {
          status: "completed_without_short_link",
          normalized_payload: normalized.toJSON(),
          qr_url: generation.result.qrUrl,
          warnings,
          reused_existing: generation.result.reusedExisting ? 1 : 0,
          error_code: generation.degradedReason,
          error_message: generation.degradedMessage
        });

        return {
          ok: true,
          requestId,
          status: "completed_without_short_link",
          normalized,
          result: generation.result
        };
      }

      this.requestRepository.update(requestId, {
        status: "completed",
        normalized_payload: normalized.toJSON(),
        short_url: generation.result.shortUrl,
        bitly_id: generation.bitlyId,
        bitly_payload: generation.bitlyPayload,
        qr_url: generation.result.qrUrl,
        reused_existing: generation.result.reusedExisting ? 1 : 0
      });

      return {
        ok: true,
        requestId,
        status: "completed",
        normalized,
        result: generation.result
      };
    } catch (error) {
      this.requestRepository.update(requestId, {
        status: "failed",
        error_code: "utm_library_regeneration_failed",
        error_message: error.message
      });

      return {
        ok: false,
        statusCode: 500,
        code: "utm_library_regeneration_failed",
        message: "Unable to regenerate this link right now."
      };
    }
  }
}

function buildOriginalMessage(normalized, messageLabel, originalRequestId) {
  const parts = [
    `${messageLabel}${originalRequestId ? ` from request #${originalRequestId}` : ""}`,
    `Client: ${normalized.clientDisplayName}`,
    `Channel: ${normalized.channelDisplayName}`,
    `Campaign: ${normalized.utmCampaign}`,
    `Destination: ${normalized.destinationUrl}`
  ];

  return parts.join(" | ");
}

function normalizeOptional(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function normalizeNullable(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return String(value).trim();
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
