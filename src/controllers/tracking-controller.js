import { NodeResponse } from "../http/response.js";
import {
  validatePluginHeartbeatPayload,
  validateTrackingBatchPayload
} from "../domain/tracking-payloads.js";

export class TrackingController {
  constructor({
    trackingAuthService,
    trackingIngestionService,
    pluginConfigService,
    websiteRepository,
    pluginTelemetryService = null,
    websiteObservabilityEventRepository = null
  }) {
    this.trackingAuthService = trackingAuthService;
    this.trackingIngestionService = trackingIngestionService;
    this.pluginConfigService = pluginConfigService;
    this.websiteRepository = websiteRepository;
    this.pluginTelemetryService = pluginTelemetryService;
    this.websiteObservabilityEventRepository = websiteObservabilityEventRepository;
  }

  async handleBatch(request) {
    const auth = this.authorize(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsedBody = request.parseJson();
    if (!parsedBody.ok) {
      this.recordIngestionFailure(auth.context.website, {
        installationId: extractInstallationId(request.rawBody),
        pluginVersion: extractPluginVersion(request.rawBody),
        code: parsedBody.errorCode,
        message: parsedBody.errorMessage,
        details: {
          path: request.path,
          method: request.method
        }
      });
      return badRequest(parsedBody.errorCode, parsedBody.errorMessage);
    }

    const validated = validateTrackingBatchPayload(parsedBody.value);
    if (!validated.ok) {
      this.recordIngestionFailure(auth.context.website, {
        installationId: stringValue(parsedBody.value.installation_id),
        pluginVersion: stringValue(parsedBody.value.plugin_version),
        code: validated.code,
        message: validated.message,
        details: {
          path: request.path,
          method: request.method
        }
      });
      return badRequest(validated.code, validated.message);
    }

    try {
      const summary = this.trackingIngestionService.ingestBatch(auth.context, validated.value);

      return NodeResponse.json({
        status: "ok",
        summary
      });
    } catch (error) {
      this.recordIngestionFailure(auth.context.website, {
        installationId: stringValue(validated.value.installation_id),
        pluginVersion: stringValue(validated.value.plugin_version),
        code: error.code ?? "ingestion_failed",
        message: error.message,
        details: {
          path: request.path,
          method: request.method
        }
      });

      return NodeResponse.json({
        status: "error",
        error: {
          code: "tracking_ingestion_failed",
          message: "Tracking batch ingestion failed."
        }
      }, 500);
    }
  }

  async handleConfig(request) {
    const auth = this.authorize(request);
    if (!auth.ok) {
      return auth.response;
    }

    const receivedAt = new Date().toISOString();
    this.websiteRepository.updateHeartbeat(auth.context.website.id, {
      lastSeenAt: receivedAt,
      updatedAt: receivedAt
    });
    this.pluginTelemetryService?.recordConfigFetch(auth.context.website, {
      installation_id: stringValue(request.query.installation_id),
      plugin_version: stringValue(request.query.plugin_version),
      query: request.query
    }, receivedAt);

    return NodeResponse.json(this.pluginConfigService.getWebsiteConfig(auth.context.website));
  }

  async handleHeartbeat(request) {
    const auth = this.authorize(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsedBody = request.parseJson();
    if (!parsedBody.ok) {
      return badRequest(parsedBody.errorCode, parsedBody.errorMessage);
    }

    const validated = validatePluginHeartbeatPayload(parsedBody.value);
    if (!validated.ok) {
      return badRequest(validated.code, validated.message);
    }

    const lastSeenAt = new Date().toISOString();
    this.websiteRepository.updateHeartbeat(auth.context.website.id, {
      lastSeenAt,
      installedPluginVersion: validated.value.plugin_version,
      updatedAt: lastSeenAt
    });
    this.pluginTelemetryService?.recordHeartbeat(auth.context.website, validated.value, lastSeenAt);

    return NodeResponse.json({
      status: "ok",
      website_id: Number(auth.context.website.id),
      installation_id: validated.value.installation_id,
      plugin_version: validated.value.plugin_version,
      last_seen_at: lastSeenAt
    });
  }

  authorize(request) {
    const auth = this.trackingAuthService.verifyRequest(request);
    if (!auth.ok) {
      return {
        ok: false,
        response: NodeResponse.json({
          status: "error",
          error: auth.error
        }, auth.statusCode)
      };
    }

    return {
      ok: true,
      context: auth
    };
  }

  recordIngestionFailure(website, {
    installationId = null,
    pluginVersion = null,
    code = "ingestion_failed",
    message = "Tracking batch ingestion failed.",
    details = {}
  } = {}) {
    if (!this.websiteObservabilityEventRepository || !website?.id) {
      return;
    }

    this.websiteObservabilityEventRepository.create({
      websiteId: Number(website.id),
      installationId,
      pluginVersion,
      eventType: "ingestion_failure",
      errorCode: code,
      message,
      detailsJson: details,
      occurredAt: new Date().toISOString()
    });
  }
}

function badRequest(code, message) {
  return NodeResponse.json({
    status: "error",
    error: {
      code,
      message
    }
  }, 400);
}

function stringValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function extractInstallationId(rawBody) {
  return stringValue(parseRequestBodyObject(rawBody)?.installation_id);
}

function extractPluginVersion(rawBody) {
  return stringValue(parseRequestBodyObject(rawBody)?.plugin_version);
}

function parseRequestBodyObject(rawBody) {
  const normalized = String(rawBody ?? "").trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
