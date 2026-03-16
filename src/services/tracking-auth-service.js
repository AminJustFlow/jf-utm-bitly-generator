import crypto from "node:crypto";
import { maskValue } from "../support/webhook-debug.js";

export class TrackingAuthService {
  constructor({
    websiteRepository,
    websiteObservabilityEventRepository = null,
    encryptionKey = "",
    maxAgeSeconds = 300,
    logger = null
  } = {}) {
    this.websiteRepository = websiteRepository;
    this.websiteObservabilityEventRepository = websiteObservabilityEventRepository;
    this.encryptionKey = deriveEncryptionKey(encryptionKey);
    this.maxAgeSeconds = Number(maxAgeSeconds ?? 300);
    this.logger = logger;
  }

  createCredentials() {
    if (!this.encryptionKey) {
      const error = new Error("TRACKING_SECRET_ENCRYPTION_KEY must be configured before provisioning websites. Add it to .env or the process environment and restart the server.");
      error.code = "missing_tracking_encryption_key";
      throw error;
    }

    const publicKey = `jfpk_${randomToken(24)}`;
    const secretPlain = `jfsk_${randomToken(48)}`;

    return {
      publicKey,
      secretPlain,
      secretKeyHash: hashSecret(secretPlain),
      secretKeyEncrypted: encryptSecret(secretPlain, this.encryptionKey)
    };
  }

  sign(secretPlain, timestamp, rawBody = "") {
    return crypto
      .createHmac("sha256", String(secretPlain ?? ""))
      .update(`${String(timestamp ?? "")}.${String(rawBody ?? "")}`)
      .digest("hex");
  }

  verifyRequest(request, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date();
    const publicKey = normalizeString(request.header("x-jf-public-key"));
    const timestamp = normalizeString(request.header("x-jf-timestamp"));
    const signature = normalizeSignature(request.header("x-jf-signature"));
    const website = publicKey
      ? this.websiteRepository.findByPublicKey(publicKey)
      : null;

    if (!publicKey) {
      return this.authError(401, "missing_public_key", "Missing X-JF-Public-Key header.");
    }

    if (!timestamp) {
      return this.authError(401, "missing_timestamp", "Missing X-JF-Timestamp header.", {
        request,
        website,
        publicKey
      });
    }

    if (!signature) {
      return this.authError(401, "missing_signature", "Missing X-JF-Signature header.", {
        request,
        website,
        publicKey
      });
    }

    const timestampMs = Date.parse(timestamp);
    if (Number.isNaN(timestampMs)) {
      return this.authError(401, "invalid_timestamp", "X-JF-Timestamp must be a valid ISO timestamp.", {
        request,
        website,
        publicKey
      });
    }

    const ageMs = Math.abs(now.getTime() - timestampMs);
    if (ageMs > this.maxAgeSeconds * 1000) {
      return this.authError(
        401,
        "stale_timestamp",
        `X-JF-Timestamp is outside the allowed ${this.maxAgeSeconds}-second window.`,
        {
          request,
          website,
          publicKey
        }
      );
    }

    if (!website) {
      return this.authError(403, "website_not_found", "Unknown website credentials.");
    }

    if (String(website.status ?? "").trim().toLowerCase() !== "active") {
      return this.authError(403, "website_inactive", "Website credentials are not active.", {
        request,
        website,
        publicKey
      });
    }

    if (!this.encryptionKey) {
      return this.authError(500, "auth_unavailable", "Tracking request verification is not configured.", {
        request,
        website,
        publicKey
      });
    }

    let secretPlain = "";
    try {
      secretPlain = decryptSecret(website.secret_key_encrypted, this.encryptionKey);
    } catch (error) {
      this.logger?.error?.("Tracking secret decryption failed.", {
        websiteId: website.id,
        publicKey: maskValue(publicKey),
        error: error.message
      });

      return this.authError(500, "auth_unavailable", "Tracking request verification is not available.", {
        request,
        website,
        publicKey
      });
    }

    const expectedSignature = this.sign(secretPlain, timestamp, request.rawBody ?? "");
    if (!timingSafeStringEqual(signature, expectedSignature)) {
      return this.authError(403, "invalid_signature", "Invalid tracking request signature.", {
        request,
        website,
        publicKey
      });
    }

    return {
      ok: true,
      website,
      publicKey,
      timestamp
    };
  }

  authError(statusCode, code, message, context = {}) {
    this.recordAuthFailure(code, message, context);
    return {
      ok: false,
      statusCode,
      error: {
        code,
        message
      }
    };
  }

  recordAuthFailure(code, message, context = {}) {
    if (!this.websiteObservabilityEventRepository || !context.website?.id) {
      return;
    }

    this.websiteObservabilityEventRepository.create({
      websiteId: Number(context.website.id),
      installationId: extractInstallationId(context.request),
      pluginVersion: extractPluginVersion(context.request),
      eventType: "auth_failure",
      errorCode: code,
      message,
      detailsJson: {
        path: context.request?.path ?? "",
        method: context.request?.method ?? "",
        public_key: context.publicKey ? maskValue(context.publicKey) : null,
        timestamp: context.request?.header?.("x-jf-timestamp") ?? null
      },
      occurredAt: new Date().toISOString()
    });
  }
}

function hashSecret(secretPlain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(secretPlain, salt, 64).toString("hex");
  return `scrypt:${salt}:${digest}`;
}

function encryptSecret(secretPlain, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(secretPlain, "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return `v1.${iv.toString("hex")}.${authTag.toString("hex")}.${encrypted.toString("hex")}`;
}

function decryptSecret(ciphertext, key) {
  const [version, ivHex, authTagHex, encryptedHex] = String(ciphertext ?? "").split(".");
  if (version !== "v1" || !ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Unsupported encrypted secret format.");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

function deriveEncryptionKey(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  return crypto.createHash("sha256").update(normalized, "utf8").digest();
}

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""), "utf8");
  const rightBuffer = Buffer.from(String(right ?? ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeSignature(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  return (normalized.startsWith("sha256=")
    ? normalized.slice("sha256=".length)
    : normalized).toLowerCase();
}

function normalizeString(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function randomToken(bytes) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function extractInstallationId(request) {
  const queryInstallationId = normalizeString(request?.query?.installation_id);
  if (queryInstallationId) {
    return queryInstallationId;
  }

  const payload = parseRequestBodyObject(request?.rawBody);
  return normalizeString(payload?.installation_id);
}

function extractPluginVersion(request) {
  const queryVersion = normalizeString(request?.query?.plugin_version);
  if (queryVersion) {
    return queryVersion;
  }

  const payload = parseRequestBodyObject(request?.rawBody);
  return normalizeString(payload?.plugin_version);
}

function parseRequestBodyObject(rawBody) {
  const normalized = String(rawBody ?? "").trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(normalized);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
