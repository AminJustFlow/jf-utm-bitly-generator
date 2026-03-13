import assert from "node:assert/strict";
import fs from "node:fs";
import rules from "../config/rules.js";
import { RulesService } from "../src/services/rules-service.js";
import { UrlService } from "../src/services/url-service.js";
import { FingerprintService } from "../src/services/fingerprint-service.js";
import { RequestNormalizer } from "../src/services/request-normalizer.js";
import { ParsedLinkRequest } from "../src/domain/parsed-link-request.js";
import { ClickUpPayloadMapper } from "../src/services/clickup-payload-mapper.js";
import { WebhookVerifier } from "../src/services/webhook-verifier.js";

const rulesService = new RulesService(rules);
const urlService = new UrlService();
const fingerprintService = new FingerprintService();
const normalizer = new RequestNormalizer(rulesService, urlService, 0.72);
const nullLogger = {
  debug() {},
  info() {},
  warning() {},
  error() {}
};
const payloadMapper = new ClickUpPayloadMapper({
  workspaceId: "901234",
  defaultChannelId: "456789",
  debugWebhook: true
}, nullLogger);
const webhookVerifier = new WebhookVerifier({
  webhookSecret: "test-secret",
  signatureHeader: "X-Signature",
  workspaceId: "901234",
  allowedChannelIds: ["456789"],
  debugWebhook: true,
  debugSkipSignature: false,
  debugSkipChannelCheck: false,
  debugSkipWorkspaceCheck: false
}, nullLogger);

const tests = [
  {
    name: "alias normalization",
    run() {
      assert.equal(rulesService.normalizeChannel("ig", null, false), "instagram");
      assert.equal(rulesService.normalizeClient("guardian angel senior services"), "gas");
    }
  },
  {
    name: "campaign slug generation",
    run() {
      const campaign = rulesService.buildCampaign("studleys", "instagram", "Spring Sale", new Date("2026-03-13T10:00:00Z"));
      assert.equal(campaign.campaignLabel, "spring_sale");
      assert.equal(campaign.canonicalCampaign, "studleys_2026_03_spring_sale");
    }
  },
  {
    name: "utm generation with existing query params",
    run() {
      const result = urlService.appendUtms("https://studleys.com/perennials?color=red&utm_source=old", {
        utm_source: "instagram",
        utm_medium: "social",
        utm_campaign: "studleys_2026_03_spring_sale"
      });

      assert.equal(
        result,
        "https://studleys.com/perennials?color=red&utm_campaign=studleys_2026_03_spring_sale&utm_medium=social&utm_source=instagram"
      );
    }
  },
  {
    name: "duplicate fingerprint generation",
    run() {
      const decisionA = normalizer.normalize(ParsedLinkRequest.fromObject({
        client: "studleys",
        channel: "instagram",
        asset_type: "social",
        campaign_label: "spring sale",
        destination_url: "https://studleys.com/perennials?ref=abc",
        needs_qr: false,
        confidence: 0.91,
        warnings: [],
        missing_fields: []
      }));

      const decisionB = normalizer.normalize(ParsedLinkRequest.fromObject({
        client: "studleys",
        channel: "ig",
        asset_type: "social",
        campaign_label: "spring sale",
        destination_url: "https://studleys.com/perennials?utm_source=old&ref=abc",
        needs_qr: false,
        confidence: 0.91,
        warnings: [],
        missing_fields: []
      }));

      assert.equal(decisionA.status, "ready");
      assert.equal(decisionB.status, "ready");
      assert.equal(
        fingerprintService.generate(decisionA.normalizedRequest),
        fingerprintService.generate(decisionB.normalizedRequest)
      );
    }
  },
  {
    name: "low confidence clarification branching",
    run() {
      const decision = normalizer.normalize(ParsedLinkRequest.fromObject({
        client: "studleys",
        channel: "instagram",
        asset_type: "social",
        campaign_label: "spring sale",
        destination_url: "https://studleys.com/perennials",
        needs_qr: false,
        confidence: 0.3,
        warnings: [],
        missing_fields: []
      }));

      assert.equal(decision.status, "clarify");
      assert.match(decision.message, /not confident enough/iu);
    }
  },
  {
    name: "unsupported client or channel handling",
    run() {
      const decision = normalizer.normalize(ParsedLinkRequest.fromObject({
        client: "unknown",
        channel: "tiktok",
        asset_type: "social",
        campaign_label: "launch",
        destination_url: "https://example.com",
        needs_qr: false,
        confidence: 0.95,
        warnings: [],
        missing_fields: []
      }));

      assert.equal(decision.status, "clarify");
      assert.ok(decision.missingFields.includes("client") || decision.missingFields.includes("channel"));
    }
  },
  {
    name: "clickup payload mapper identifies chat message payload shape",
    run() {
      const payload = JSON.parse(fs.readFileSync(new URL("./fixtures/clickup-chat-message.json", import.meta.url), "utf8"));
      const result = payloadMapper.map(payload, { correlationId: "test-correlation" });

      assert.equal(result.diagnostics.payloadShape, "message");
      assert.equal(result.event.workspaceId, "901234");
      assert.equal(result.event.channelId, "456789");
      assert.equal(result.event.messageText, "Need an Instagram link for Studleys spring sale to https://studleys.com/perennials");
    }
  },
  {
    name: "clickup test webhook fixture fails with explicit missing message code",
    run() {
      const payload = JSON.parse(fs.readFileSync(new URL("./fixtures/clickup-test-webhook.json", import.meta.url), "utf8"));
      let caught = null;

      try {
        payloadMapper.map(payload, { correlationId: "test-correlation" });
      } catch (error) {
        caught = error;
      }

      assert.ok(caught);
      assert.equal(caught.code, "missing_message_text");
    }
  },
  {
    name: "signature debug skip allows manual webhook tests without signature header",
    run() {
      const verifier = new WebhookVerifier({
        webhookSecret: "test-secret",
        signatureHeader: "X-Signature",
        workspaceId: "901234",
        allowedChannelIds: ["456789"],
        debugWebhook: true,
        debugSkipSignature: true,
        debugSkipChannelCheck: false,
        debugSkipWorkspaceCheck: false
      }, nullLogger);

      const verification = verifier.verify({
        header() {
          return null;
        }
      }, {
        workspaceId: "901234",
        channelId: "456789"
      }, {}, { correlationId: "test-correlation" });

      assert.equal(verification.passed, true);
      assert.ok(verification.diagnostics.bypasses.includes("signature"));
    }
  },
  {
    name: "signature mismatch remains an explicit verifier error",
    run() {
      const verification = webhookVerifier.verify({
        header(name) {
          if (name === "x-signature") {
            return "wrong-secret";
          }

          return null;
        }
      }, {
        workspaceId: "901234",
        channelId: "456789"
      }, {}, { correlationId: "test-correlation" });

      assert.equal(verification.passed, false);
      assert.equal(verification.reasons[0].code, "invalid_signature");
    }
  }
];

let failures = 0;

for (const testCase of tests) {
  try {
    testCase.run();
    process.stdout.write(`[PASS] ${testCase.name}\n`);
  } catch (error) {
    failures += 1;
    process.stdout.write(`[FAIL] ${testCase.name}: ${error.message}\n`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  process.stdout.write("\nAll tests passed.\n");
}
