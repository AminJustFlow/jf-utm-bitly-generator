import { LinkGenerationResult } from "../domain/link-generation-result.js";
import { BitlyError } from "./bitly-service.js";

export class LinkGenerationService {
  constructor({
    generatedLinkRepository,
    bitlyService,
    qrCodeService
  }) {
    this.generatedLinkRepository = generatedLinkRepository;
    this.bitlyService = bitlyService;
    this.qrCodeService = qrCodeService;
  }

  async generate(normalized, fingerprint) {
    const existing = this.generatedLinkRepository.findByFingerprint(fingerprint);
    if (existing) {
      const refreshed = this.ensureQr(existing, normalized);
      return {
        fingerprint,
        result: new LinkGenerationResult({
          fingerprint,
          longUrl: refreshed.final_long_url || normalized.finalLongUrl,
          shortUrl: refreshed.short_url,
          qrUrl: refreshed.qr_url ?? null,
          reusedExisting: true,
          bitlyMetadata: safeJsonParse(refreshed.bitly_payload)
        }),
        bitlyId: refreshed.bitly_id ?? null,
        bitlyPayload: safeJsonParse(refreshed.bitly_payload),
        degraded: false
      };
    }

    try {
      const bitly = await this.bitlyService.shorten(normalized.finalLongUrl);
      const qrUrl = normalized.needsQr ? this.qrCodeService.generateUrl(bitly.link || normalized.finalLongUrl) : null;
      const timestamp = new Date().toISOString();

      try {
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
        const raceExisting = this.generatedLinkRepository.findByFingerprint(fingerprint);
        if (!raceExisting) {
          throw error;
        }

        const refreshed = this.ensureQr(raceExisting, normalized);
        return {
          fingerprint,
          result: new LinkGenerationResult({
            fingerprint,
            longUrl: refreshed.final_long_url || normalized.finalLongUrl,
            shortUrl: refreshed.short_url,
            qrUrl: refreshed.qr_url ?? null,
            reusedExisting: true,
            bitlyMetadata: safeJsonParse(refreshed.bitly_payload)
          }),
          bitlyId: refreshed.bitly_id ?? null,
          bitlyPayload: safeJsonParse(refreshed.bitly_payload),
          degraded: false
        };
      }

      return {
        fingerprint,
        result: new LinkGenerationResult({
          fingerprint,
          longUrl: normalized.finalLongUrl,
          shortUrl: bitly.link,
          qrUrl,
          reusedExisting: false,
          bitlyMetadata: bitly.payload
        }),
        bitlyId: bitly.id ?? null,
        bitlyPayload: bitly.payload,
        degraded: false
      };
    } catch (error) {
      if (!this.shouldDegradeBitlyFailure(error)) {
        throw error;
      }

      const qrUrl = normalized.needsQr ? this.qrCodeService.generateUrl(normalized.finalLongUrl) : null;
      return {
        fingerprint,
        result: new LinkGenerationResult({
          fingerprint,
          longUrl: normalized.finalLongUrl,
          shortUrl: null,
          qrUrl,
          reusedExisting: false,
          bitlyMetadata: error.responseBody ?? {},
          shortLinkAvailable: false
        }),
        bitlyId: null,
        bitlyPayload: error.responseBody ?? {},
        degraded: true,
        degradedReason: "bitly_quota_reached",
        degradedMessage: error.message
      };
    }
  }

  shouldDegradeBitlyFailure(error) {
    return error instanceof BitlyError
      && error.statusCode === 429
      && error.code === "MONTHLY_ENCODE_LIMIT_REACHED";
  }

  ensureQr(existing, normalized) {
    if (!normalized.needsQr || existing.qr_url) {
      return existing;
    }

    const qrUrl = this.qrCodeService.generateUrl(existing.short_url || existing.final_long_url || normalized.finalLongUrl);
    this.generatedLinkRepository.updateByFingerprint(existing.fingerprint, {
      qr_url: qrUrl
    });

    return {
      ...existing,
      qr_url: qrUrl
    };
  }
}

function safeJsonParse(value) {
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
