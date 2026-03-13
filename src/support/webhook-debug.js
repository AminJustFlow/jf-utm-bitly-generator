const MASKED_HEADERS = [
  "authorization",
  "x-signature",
  "cookie",
  "set-cookie",
  "x-api-key"
];

export function maskValue(value, visibleStart = 4, visibleEnd = 2) {
  const stringValue = String(value ?? "");
  if (!stringValue) {
    return "";
  }

  if (stringValue.length <= visibleStart + visibleEnd) {
    return "*".repeat(stringValue.length);
  }

  const start = stringValue.slice(0, visibleStart);
  const end = stringValue.slice(-visibleEnd);
  return `${start}${"*".repeat(Math.max(4, stringValue.length - (visibleStart + visibleEnd)))}${end}`;
}

export function maskHeaders(headers = {}) {
  const masked = {};
  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = String(key).toLowerCase();
    if (MASKED_HEADERS.includes(normalizedKey)) {
      masked[key] = maskValue(value);
      continue;
    }

    masked[key] = value;
  }

  return masked;
}

export function previewRawBody(rawBody, limit = 20000) {
  const body = String(rawBody ?? "");
  if (body.length <= limit) {
    return body;
  }

  return `${body.slice(0, limit)}...[truncated ${body.length - limit} chars]`;
}

export function inferPayloadShape(matchPath) {
  if (!matchPath) {
    return "unknown";
  }

  if (matchPath.startsWith("message.")) {
    return "message";
  }

  if (matchPath.startsWith("payload.message.")) {
    return "payload.message";
  }

  if (matchPath.startsWith("event_data.message.")) {
    return "event_data.message";
  }

  if (matchPath.startsWith("history_items.0.after.")) {
    return "history_items";
  }

  if (matchPath === "content" || matchPath === "text") {
    return "top_level";
  }

  return "mixed";
}
