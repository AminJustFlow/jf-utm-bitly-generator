import fs from "node:fs";
import path from "node:path";
import { encodeJson } from "./json.js";

const SENSITIVE_KEYS = new Set(["authorization", "token", "api_key", "secret", "password"]);

export class Logger {
  constructor(logPath, debug = false) {
    this.logPath = logPath;
    this.debugEnabled = debug;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
  }

  info(message, context = {}) {
    this.write("INFO", message, context);
  }

  warning(message, context = {}) {
    this.write("WARNING", message, context);
  }

  error(message, context = {}) {
    this.write("ERROR", message, context);
  }

  debug(message, context = {}) {
    if (this.debugEnabled) {
      this.write("DEBUG", message, context);
    }
  }

  write(level, message, context = {}) {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: sanitizeContext(context)
    };

    fs.appendFileSync(this.logPath, `${encodeJson(record)}\n`, "utf8");
  }
}

function sanitizeContext(context) {
  if (Array.isArray(context)) {
    return context.map((item) => sanitizeContext(item));
  }

  if (!context || typeof context !== "object") {
    return context;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
      sanitized[key] = "[redacted]";
      continue;
    }

    sanitized[key] = sanitizeContext(value);
  }

  return sanitized;
}
