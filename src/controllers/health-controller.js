import fs from "node:fs";
import path from "node:path";
import { NodeResponse } from "../http/response.js";

export class HealthController {
  constructor({ database, config }) {
    this.database = database;
    this.config = config;
  }

  async handle() {
    const checks = {
      database: this.checkDatabase(),
      configuration: this.checkConfiguration(),
      storage: this.checkStorage()
    };

    const errors = collectIssues(checks, "errors");
    const warnings = collectIssues(checks, "warnings");
    const statusCode = errors.length > 0 ? 503 : 200;

    return NodeResponse.json({
      status: errors.length > 0 ? "degraded" : "ok",
      timestamp: new Date().toISOString(),
      checks,
      errors,
      warnings
    }, statusCode);
  }

  checkDatabase() {
    try {
      this.database.prepare("SELECT 1 AS ok").get();
      return {
        status: "ok",
        errors: [],
        warnings: []
      };
    } catch (error) {
      return {
        status: "error",
        errors: [
          {
            code: "database_unavailable",
            message: error.message
          }
        ],
        warnings: []
      };
    }
  }

  checkConfiguration() {
    const errors = [];
    const warnings = [];
    const config = this.config ?? {};
    const app = config.app ?? {};
    const openai = config.openai ?? {};
    const clickup = config.clickup ?? {};
    const bitly = config.bitly ?? {};
    const required = [
      ["OPENAI_API_KEY", openai.apiKey],
      ["OPENAI_MODEL", openai.model],
      ["CLICKUP_API_TOKEN", clickup.apiToken],
      ["CLICKUP_WORKSPACE_ID", clickup.workspaceId],
      ["CLICKUP_WEBHOOK_SECRET", clickup.webhookSecret],
      ["BITLY_ACCESS_TOKEN", bitly.accessToken]
    ];
    const missing = required
      .filter(([, value]) => !hasValue(value))
      .map(([name]) => name);

    if (missing.length > 0) {
      errors.push({
        code: "missing_env",
        message: "Required environment variables are missing.",
        fields: missing
      });
    }

    if (!Array.isArray(clickup.allowedChannelIds) || clickup.allowedChannelIds.length === 0) {
      errors.push({
        code: "missing_channel_allowlist",
        message: "No ClickUp allowed channel ids are configured."
      });
    }

    const isProduction = String(app.env ?? "").trim().toLowerCase() === "production";
    const enabledBypasses = [
      clickup.debugSkipSignature ? "signature" : null,
      clickup.debugSkipChannelCheck ? "channel" : null,
      clickup.debugSkipWorkspaceCheck ? "workspace" : null
    ].filter(Boolean);

    if (isProduction && (app.debug || clickup.debugWebhook)) {
      errors.push({
        code: "debug_enabled_in_production",
        message: "Debug mode is enabled in production."
      });
    } else if (app.debug || clickup.debugWebhook) {
      warnings.push({
        code: "debug_enabled",
        message: "Debug routes are enabled."
      });
    }

    if (isProduction && enabledBypasses.length > 0) {
      errors.push({
        code: "debug_bypass_enabled_in_production",
        message: "Webhook verification bypasses are enabled in production.",
        bypasses: enabledBypasses
      });
    } else if (enabledBypasses.length > 0) {
      warnings.push({
        code: "debug_bypass_enabled",
        message: "Webhook verification bypasses are enabled.",
        bypasses: enabledBypasses
      });
    }

    return {
      status: errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok",
      errors,
      warnings,
      configured: {
        openaiApiKey: hasValue(openai.apiKey),
        openaiModel: hasValue(openai.model),
        clickupApiToken: hasValue(clickup.apiToken),
        clickupWorkspaceId: hasValue(clickup.workspaceId),
        clickupWebhookSecret: hasValue(clickup.webhookSecret),
        clickupAllowedChannelIds: Array.isArray(clickup.allowedChannelIds) && clickup.allowedChannelIds.length > 0,
        bitlyAccessToken: hasValue(bitly.accessToken)
      }
    };
  }

  checkStorage() {
    const databasePath = this.config?.database?.path ?? "";
    const logPath = this.config?.logging?.path ?? "";
    const database = this.checkWritablePath(databasePath, "database_path_not_writable");
    const logs = this.checkWritablePath(logPath, "log_path_not_writable");
    const errors = [...database.errors, ...logs.errors];

    return {
      status: errors.length > 0 ? "error" : "ok",
      errors,
      warnings: [],
      paths: {
        database,
        logs
      }
    };
  }

  checkWritablePath(targetPath, errorCode) {
    const resolvedPath = String(targetPath ?? "").trim();
    if (!resolvedPath) {
      return {
        status: "error",
        path: resolvedPath,
        checkedTarget: null,
        errors: [
          {
            code: errorCode,
            message: "Configured path is empty."
          }
        ]
      };
    }

    const checkTarget = fs.existsSync(resolvedPath) ? resolvedPath : path.dirname(resolvedPath);

    try {
      fs.accessSync(checkTarget, fs.constants.W_OK);
      return {
        status: "ok",
        path: resolvedPath,
        checkedTarget: checkTarget,
        errors: []
      };
    } catch (error) {
      return {
        status: "error",
        path: resolvedPath,
        checkedTarget: checkTarget,
        errors: [
          {
            code: errorCode,
            message: error.message,
            path: resolvedPath
          }
        ]
      };
    }
  }
}

function hasValue(value) {
  return String(value ?? "").trim().length > 0;
}

function collectIssues(checks, key) {
  return Object.entries(checks).flatMap(([check, result]) =>
    (result?.[key] ?? []).map((issue) => ({ check, ...issue }))
  );
}
