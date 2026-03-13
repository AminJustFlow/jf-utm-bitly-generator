import { maskValue } from "../support/webhook-debug.js";

export class WebhookVerifier {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  verify(request, event, mappingDiagnostics = {}, context = {}) {
    const correlationId = context.correlationId ?? null;
    const reasons = [];
    const bypasses = [];
    const secret = this.config.webhookSecret ?? "";
    const headerName = String(this.config.signatureHeader ?? "X-Signature").toLowerCase();
    const signature = request.header(headerName);
    const checks = {
      signature: Boolean(secret) && !this.config.debugSkipSignature,
      workspace: Boolean(this.config.workspaceId) && !this.config.debugSkipWorkspaceCheck,
      channel: (this.config.allowedChannelIds ?? []).length > 0 && !this.config.debugSkipChannelCheck
    };
    const diagnostics = {
      correlationId,
      headerName,
      signatureReceivedMasked: signature ? maskValue(signature) : null,
      expectedSignatureConfigured: Boolean(secret),
      workspaceIdFound: mappingDiagnostics.workspaceIdResolved ?? event.workspaceId ?? "",
      channelIdFound: mappingDiagnostics.channelIdResolved ?? event.channelId ?? "",
      payloadShape: mappingDiagnostics.payloadShape ?? "unknown",
      checks,
      bypasses
    };

    if (secret && this.config.debugSkipSignature) {
      bypasses.push("signature");
    }

    if ((this.config.allowedChannelIds ?? []).length > 0 && this.config.debugSkipChannelCheck) {
      bypasses.push("channel");
    }

    if (this.config.workspaceId && this.config.debugSkipWorkspaceCheck) {
      bypasses.push("workspace");
    }

    if (checks.signature) {
      if (!signature) {
        reasons.push({
          code: "missing_signature",
          message: `Missing ${this.config.signatureHeader} header.`
        });
      } else if (signature.trim() !== secret) {
        reasons.push({
          code: "invalid_signature",
          message: "Invalid webhook signature."
        });
      }
    }

    if (checks.workspace && event.workspaceId && this.config.workspaceId !== event.workspaceId) {
      reasons.push({
        code: "workspace_not_allowed",
        message: "Unexpected ClickUp workspace id."
      });
    }

    const allowedChannelIds = this.config.allowedChannelIds ?? [];
    if (checks.channel && !allowedChannelIds.includes(event.channelId)) {
      reasons.push({
        code: "channel_not_allowed",
        message: "Channel is not allowlisted for this bot."
      });
    }

    diagnostics.verificationPassed = reasons.length === 0;
    diagnostics.reasonCodes = reasons.map((reason) => reason.code);

    if (reasons.length > 0) {
      this.logger.warning("ClickUp webhook verification failed.", diagnostics);
    } else if (this.config.debugWebhook) {
      this.logger.debug("ClickUp webhook verification passed.", diagnostics);
    }

    return {
      passed: reasons.length === 0,
      reasons,
      diagnostics
    };
  }

  shouldIgnore(event) {
    if (event.userId && (this.config.ignoreUserIds ?? []).includes(event.userId)) {
      return true;
    }

    if (event.userName) {
      const ignoreUsernames = (this.config.ignoreUsernames ?? []).map((value) => String(value).toLowerCase());
      if (ignoreUsernames.includes(event.userName.toLowerCase())) {
        return true;
      }
    }

    return false;
  }
}
