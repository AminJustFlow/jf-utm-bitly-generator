export class WebhookVerifier {
  constructor(config) {
    this.config = config;
  }

  verify(request, event) {
    const errors = [];
    const secret = this.config.webhookSecret ?? "";
    const headerName = String(this.config.signatureHeader ?? "X-Signature").toLowerCase();

    if (secret) {
      const signature = request.header(headerName);
      if (!signature || signature.trim() !== secret) {
        errors.push("Invalid webhook signature.");
      }
    }

    if (this.config.workspaceId && event.workspaceId && this.config.workspaceId !== event.workspaceId) {
      errors.push("Unexpected ClickUp workspace id.");
    }

    const allowedChannelIds = this.config.allowedChannelIds ?? [];
    if (allowedChannelIds.length > 0 && !allowedChannelIds.includes(event.channelId)) {
      errors.push("Channel is not allowlisted for this bot.");
    }

    return errors;
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
