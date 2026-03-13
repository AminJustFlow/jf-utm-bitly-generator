import crypto from "node:crypto";
import { NodeResponse } from "../http/response.js";

export class BasicAuthService {
  constructor({
    enabled = true,
    username = "",
    password = "",
    realm = "Protected"
  } = {}) {
    this.enabled = Boolean(enabled && username && password);
    this.username = String(username ?? "");
    this.password = String(password ?? "");
    this.realm = String(realm ?? "Protected");
  }

  protect(request) {
    if (!this.enabled) {
      return null;
    }

    const credentials = this.parseAuthorizationHeader(request.header("authorization"));
    if (credentials && this.matches(credentials.username, this.username) && this.matches(credentials.password, this.password)) {
      return null;
    }

    return NodeResponse.text("Authentication required.", 401, {
      "WWW-Authenticate": `Basic realm="${escapeRealm(this.realm)}", charset="UTF-8"`
    });
  }

  parseAuthorizationHeader(value) {
    const header = String(value ?? "").trim();
    if (!header) {
      return null;
    }

    const match = /^Basic\s+(.+)$/iu.exec(header);
    if (!match) {
      return null;
    }

    try {
      const decoded = Buffer.from(match[1], "base64").toString("utf8");
      const separatorIndex = decoded.indexOf(":");
      if (separatorIndex < 0) {
        return null;
      }

      return {
        username: decoded.slice(0, separatorIndex),
        password: decoded.slice(separatorIndex + 1)
      };
    } catch {
      return null;
    }
  }

  matches(left, right) {
    const leftBuffer = Buffer.from(String(left ?? ""), "utf8");
    const rightBuffer = Buffer.from(String(right ?? ""), "utf8");
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }
}

function escapeRealm(value) {
  return String(value ?? "").replace(/"/gu, "");
}
