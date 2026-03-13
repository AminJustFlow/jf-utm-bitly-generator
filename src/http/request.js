import { decodeJson } from "../support/json.js";

export class NodeRequest {
  constructor({ method, path, headers, query, rawBody }) {
    this.method = method;
    this.path = path;
    this.headers = headers;
    this.query = query;
    this.rawBody = rawBody;
  }

  static async fromIncomingMessage(incomingMessage) {
    const chunks = [];
    for await (const chunk of incomingMessage) {
      chunks.push(chunk);
    }

    const url = new URL(incomingMessage.url ?? "/", "http://localhost");
    const headers = {};
    for (const [key, value] of Object.entries(incomingMessage.headers)) {
      headers[String(key).toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
    }

    return new NodeRequest({
      method: String(incomingMessage.method ?? "GET").toUpperCase(),
      path: url.pathname,
      headers,
      query: Object.fromEntries(url.searchParams.entries()),
      rawBody: Buffer.concat(chunks).toString("utf8")
    });
  }

  json() {
    return this.rawBody ? decodeJson(this.rawBody) : {};
  }

  header(name, defaultValue = null) {
    return this.headers[String(name).toLowerCase()] ?? defaultValue;
  }
}
