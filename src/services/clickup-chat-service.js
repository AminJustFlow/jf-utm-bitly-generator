export class ClickUpChatService {
  constructor(httpClient, config) {
    this.httpClient = httpClient;
    this.config = config;
  }

  async postMessage(channelId, message, replyToMessageId = null) {
    if (!this.config.apiToken) {
      throw new Error("CLICKUP_API_TOKEN is not configured.");
    }

    if (!this.config.workspaceId) {
      throw new Error("CLICKUP_WORKSPACE_ID is not configured.");
    }

    const endpoint = replyToMessageId
      ? `${this.config.apiBase.replace(/\/$/u, "")}/workspaces/${this.config.workspaceId}/chat/messages/${replyToMessageId}/replies`
      : `${this.config.apiBase.replace(/\/$/u, "")}/workspaces/${this.config.workspaceId}/chat/channels/${channelId}/messages`;

    let response = await this.sendRequest(endpoint, message, this.config.messageContentField);
    if (response.statusCode === 400 && this.config.messageFallbackField) {
      response = await this.sendRequest(endpoint, message, this.config.messageFallbackField);
    }

    if (response.statusCode >= 400) {
      throw new Error(`ClickUp post failed with status ${response.statusCode}: ${response.body}`);
    }

    return response.json();
  }

  async sendRequest(endpoint, message, contentField) {
    return this.httpClient.request("POST", endpoint, {
      headers: {
        Authorization: this.buildAuthorizationHeader()
      },
      json: {
        [contentField]: message
      },
      timeoutMs: this.config.timeoutMs,
      retries: 0
    });
  }

  buildAuthorizationHeader() {
    return this.config.apiToken.startsWith("pk_") ? this.config.apiToken : `Bearer ${this.config.apiToken}`;
  }
}
