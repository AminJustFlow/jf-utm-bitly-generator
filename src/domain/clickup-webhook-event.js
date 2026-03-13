export class ClickUpWebhookEvent {
  constructor({
    deliveryKey,
    workspaceId,
    channelId,
    messageId = null,
    threadMessageId = null,
    userId = null,
    userName = null,
    messageText,
    eventType,
    rawPayload
  }) {
    this.deliveryKey = deliveryKey;
    this.workspaceId = workspaceId;
    this.channelId = channelId;
    this.messageId = messageId;
    this.threadMessageId = threadMessageId;
    this.userId = userId;
    this.userName = userName;
    this.messageText = messageText;
    this.eventType = eventType;
    this.rawPayload = rawPayload;
  }

  toJSON() {
    return {
      deliveryKey: this.deliveryKey,
      workspaceId: this.workspaceId,
      channelId: this.channelId,
      messageId: this.messageId,
      threadMessageId: this.threadMessageId,
      userId: this.userId,
      userName: this.userName,
      messageText: this.messageText,
      eventType: this.eventType
    };
  }
}
