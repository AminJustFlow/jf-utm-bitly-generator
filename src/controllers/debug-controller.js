import fs from "node:fs";
import path from "node:path";
import { NodeResponse } from "../http/response.js";
import { maskHeaders, previewRawBody } from "../support/webhook-debug.js";

export class DebugController {
  constructor({ debugEnabled, fixtureDirectory, defaultFixture, config }) {
    this.debugEnabled = debugEnabled;
    this.fixtureDirectory = fixtureDirectory;
    this.defaultFixture = defaultFixture;
    this.config = config;
  }

  async handleSample(request) {
    if (!this.debugEnabled) {
      return NodeResponse.json({ status: "not_found" }, 404);
    }

    const fixturePath = this.resolveFixturePath(request?.query?.fixture);
    const payload = fs.existsSync(fixturePath)
      ? JSON.parse(fs.readFileSync(fixturePath, "utf8"))
      : {};

    return NodeResponse.json({
      fixture: path.basename(fixturePath),
      payload
    });
  }

  async handleInfo() {
    if (!this.debugEnabled) {
      return NodeResponse.json({ status: "not_found" }, 404);
    }

    const allowedChannelIds = this.config.clickup.allowedChannelIds ?? [];

    return NodeResponse.json({
      status: "ok",
      debug: {
        appDebug: this.config.app.debug,
        webhookDebug: this.config.clickup.debugWebhook
      },
      checks: {
        signature: Boolean(this.config.clickup.webhookSecret) && !this.config.clickup.debugSkipSignature,
        channel: allowedChannelIds.length > 0 && !this.config.clickup.debugSkipChannelCheck,
        workspace: Boolean(this.config.clickup.workspaceId) && !this.config.clickup.debugSkipWorkspaceCheck
      },
      bypasses: {
        skipSignature: this.config.clickup.debugSkipSignature,
        skipChannelCheck: this.config.clickup.debugSkipChannelCheck,
        skipWorkspaceCheck: this.config.clickup.debugSkipWorkspaceCheck
      },
      env: {
        openaiApiKeyConfigured: Boolean(this.config.openai.apiKey),
        clickupApiTokenConfigured: Boolean(this.config.clickup.apiToken),
        clickupWorkspaceIdConfigured: Boolean(this.config.clickup.workspaceId),
        clickupDefaultChannelConfigured: Boolean(this.config.clickup.defaultChannelId),
        clickupWebhookSecretConfigured: Boolean(this.config.clickup.webhookSecret),
        bitlyAccessTokenConfigured: Boolean(this.config.bitly.accessToken)
      },
      clickup: {
        signatureHeader: this.config.clickup.signatureHeader,
        workspaceId: this.config.clickup.workspaceId || null,
        defaultChannelId: this.config.clickup.defaultChannelId || null,
        allowedChannelIds
      },
      routes: {
        webhook: "/webhooks/clickup/chat",
        webhookInfo: "/debug/webhook-info",
        webhookEcho: "/debug/webhook-echo",
        samplePayload: "/debug/sample-payload"
      },
      fixtures: fs.existsSync(this.fixtureDirectory)
        ? fs.readdirSync(this.fixtureDirectory).filter((file) => file.endsWith(".json"))
        : []
    });
  }

  async handleEcho(request) {
    if (!this.debugEnabled) {
      return NodeResponse.json({ status: "not_found" }, 404);
    }

    const parsed = request.parseJson();
    return NodeResponse.json({
      status: "ok",
      method: request.method,
      path: request.path,
      query: request.query,
      headers: maskHeaders(request.headers),
      body: parsed.ok ? parsed.value : null,
      rawBody: previewRawBody(request.rawBody),
      parse: parsed.ok
        ? { ok: true }
        : {
          ok: false,
          code: parsed.errorCode,
          message: parsed.errorMessage,
          parseError: parsed.parseError ?? null
        }
    });
  }

  resolveFixturePath(requestedFixture = null) {
    const candidate = path.basename(requestedFixture || this.defaultFixture);
    const fixturePath = path.join(this.fixtureDirectory, candidate);
    if (fs.existsSync(fixturePath)) {
      return fixturePath;
    }

    return path.join(this.fixtureDirectory, path.basename(this.defaultFixture));
  }
}
