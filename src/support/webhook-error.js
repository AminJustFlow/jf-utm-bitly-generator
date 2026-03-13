export class WebhookError extends Error {
  constructor(code, message, statusCode = 400, details = {}) {
    super(message);
    this.name = "WebhookError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
