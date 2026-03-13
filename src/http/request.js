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

  parseJson() {
    const trimmed = String(this.rawBody ?? "").trim();
    if (!trimmed) {
      return {
        ok: false,
        errorCode: "missing_body",
        errorMessage: "Expected a JSON payload."
      };
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {
          ok: false,
          errorCode: "unsupported_payload_shape",
          errorMessage: "Expected a JSON object payload."
        };
      }

      return {
        ok: true,
        value: parsed
      };
    } catch (error) {
      return {
        ok: false,
        errorCode: "invalid_json",
        errorMessage: "Request body was not valid JSON.",
        parseError: error.message
      };
    }
  }

  header(name, defaultValue = null) {
    return this.headers[String(name).toLowerCase()] ?? defaultValue;
  }
}
