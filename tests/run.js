import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import rules from "../config/rules.js";
import { HealthController } from "../src/controllers/health-controller.js";
import { ReportingController } from "../src/controllers/reporting-controller.js";
import { TrackingController } from "../src/controllers/tracking-controller.js";
import { UtmLibraryController } from "../src/controllers/utm-library-controller.js";
import { UtmBuilderController } from "../src/controllers/utm-builder-controller.js";
import { UtmImportController } from "../src/controllers/utm-import-controller.js";
import { WebsiteAdminController } from "../src/controllers/website-admin-controller.js";
import { RulesService } from "../src/services/rules-service.js";
import { UrlService } from "../src/services/url-service.js";
import { FingerprintService } from "../src/services/fingerprint-service.js";
import { UtmLibraryService } from "../src/services/utm-library-service.js";
import { RequestNormalizer } from "../src/services/request-normalizer.js";
import { ParsedLinkRequest } from "../src/domain/parsed-link-request.js";
import { ClickUpPayloadMapper } from "../src/services/clickup-payload-mapper.js";
import { WebhookVerifier } from "../src/services/webhook-verifier.js";
import { HeuristicParser } from "../src/services/heuristic-parser.js";
import { FallbackCommandParser } from "../src/services/fallback-command-parser.js";
import { OpenAIParserService } from "../src/services/openai-parser-service.js";
import { LinkGenerationService } from "../src/services/link-generation-service.js";
import { LinkWorkflowService } from "../src/services/link-workflow-service.js";
import { MessageFormatter } from "../src/services/message-formatter.js";
import { UtmLibraryEditorService } from "../src/services/utm-library-editor-service.js";
import { BasicAuthService } from "../src/services/basic-auth-service.js";
import { AnalyticsReportingService } from "../src/services/analytics-reporting-service.js";
import { AnalyticsRefreshService } from "../src/services/analytics-refresh-service.js";
import { ClickUpChatService } from "../src/services/clickup-chat-service.js";
import { IdentityStitchingService } from "../src/services/identity-stitching-service.js";
import { PluginConfigService } from "../src/services/plugin-config-service.js";
import { PluginTelemetryService } from "../src/services/plugin-telemetry-service.js";
import { RateLimiter } from "../src/services/rate-limiter.js";
import { ReceivedRequestRecoveryService } from "../src/services/received-request-recovery-service.js";
import { TrackerImportService } from "../src/services/tracker-import-service.js";
import { TrackingAuthService } from "../src/services/tracking-auth-service.js";
import { TrackingIngestionService } from "../src/services/tracking-ingestion-service.js";
import { WebsiteAdministrationService } from "../src/services/website-administration-service.js";
import { WebsiteHealthService } from "../src/services/website-health-service.js";
import { XlsxWorkbookReader } from "../src/services/xlsx-workbook-reader.js";
import { WebsiteProvisioningService } from "../src/services/website-provisioning-service.js";
import { loadEnvFile } from "../src/support/env-loader.js";
import { AnalyticsRollupRepository } from "../src/repositories/analytics-rollup-repository.js";
import { AnalyticsRefreshJobRepository } from "../src/repositories/analytics-refresh-job-repository.js";
import { ClickUpWebhookController } from "../src/controllers/clickup-webhook-controller.js";
import { ClientRepository } from "../src/repositories/client-repository.js";
import { ConversionAttributionRepository } from "../src/repositories/conversion-attribution-repository.js";
import { ConversionRepository } from "../src/repositories/conversion-repository.js";
import { GeneratedLinkRepository } from "../src/repositories/generated-link-repository.js";
import { RequestRepository } from "../src/repositories/request-repository.js";
import { SessionRepository } from "../src/repositories/session-repository.js";
import { StitchedProfileRepository } from "../src/repositories/stitched-profile-repository.js";
import { TrackingEventRepository } from "../src/repositories/tracking-event-repository.js";
import { VisitorRepository } from "../src/repositories/visitor-repository.js";
import { WebsiteCredentialEventRepository } from "../src/repositories/website-credential-event-repository.js";
import { WebsiteInstallationEventRepository } from "../src/repositories/website-installation-event-repository.js";
import { WebsiteInstallationRepository } from "../src/repositories/website-installation-repository.js";
import { WebsiteObservabilityEventRepository } from "../src/repositories/website-observability-event-repository.js";
import { WebsiteRepository } from "../src/repositories/website-repository.js";

const rulesService = new RulesService(rules);
const urlService = new UrlService();
const fingerprintService = new FingerprintService();
const normalizer = new RequestNormalizer(rulesService, urlService, 0.72);
const heuristicParser = new HeuristicParser(rulesService);
const commandParser = new FallbackCommandParser();
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
      assert.equal(rulesService.normalizeChannel("linkdln", null, false), "linkedin");
      assert.equal(rulesService.normalizeChannel("navigation", "owned", false), "website");
      assert.equal(rulesService.normalizeClient("studleays"), "studleys");
      assert.equal(rulesService.normalizeClient("guardian angel senior services"), "gas");
    }
  },
  {
    name: "campaign fallback generation",
    run() {
      const campaign = rulesService.buildCampaign("studleys", "instagram", "Spring Sale", new Date("2026-03-13T10:00:00Z"));
      assert.equal(campaign.campaignLabel, "spring_sale");
      assert.equal(campaign.canonicalCampaign, "spring_sale");
    }
  },
  {
    name: "utm generation keeps all five fields with existing query params",
    run() {
      const result = urlService.appendUtms("https://studleys.com/perennials?color=red&utm_source=old", {
        utm_source: "Instagram",
        utm_medium: "Social",
        utm_campaign: "SpringSale",
        utm_term: "",
        utm_content: "PlantFinder"
      });

      assert.equal(
        result,
        "https://studleys.com/perennials?color=red&utm_source=Instagram&utm_medium=Social&utm_campaign=SpringSale&utm_term=&utm_content=PlantFinder"
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
    name: "client channel defaults resolve the full five-field UTM set",
    run() {
      const decision = normalizer.normalize(ParsedLinkRequest.fromObject({
        client: "jf",
        channel: "linkedin",
        asset_type: "social",
        campaign_label: "contact",
        destination_url: "https://justflownh.com/#!/contactus",
        needs_qr: false,
        confidence: 0.95,
        warnings: [],
        missing_fields: []
      }));

      assert.equal(decision.status, "ready");
      assert.equal(decision.normalizedRequest.utmSource, "LinkedIn");
      assert.equal(decision.normalizedRequest.utmMedium, "Social");
      assert.equal(decision.normalizedRequest.utmCampaign, "Website");
      assert.equal(decision.normalizedRequest.utmTerm, "");
      assert.equal(decision.normalizedRequest.utmContent, "Contact");
      assert.match(decision.normalizedRequest.finalLongUrl, /utm_campaign=Website/iu);
      assert.match(decision.normalizedRequest.finalLongUrl, /utm_content=Contact/iu);
      assert.match(decision.normalizedRequest.finalLongUrl, /utm_term=/iu);
      assert.match(decision.normalizedRequest.finalLongUrl, /#!\/contactus$/iu);
    }
  },
  {
    name: "website channel defaults can be customized per client",
    run() {
      const decision = normalizer.normalize(ParsedLinkRequest.fromObject({
        client: "studleys",
        channel: "website",
        asset_type: "owned",
        campaign_label: null,
        destination_url: "https://plants.studleys.com/12120034/",
        needs_qr: false,
        confidence: 0.95,
        warnings: [],
        missing_fields: []
      }));

      assert.equal(decision.status, "ready");
      assert.equal(decision.normalizedRequest.utmSource, "Navigation");
      assert.equal(decision.normalizedRequest.utmMedium, "Website");
      assert.equal(decision.normalizedRequest.utmCampaign, "PlantFinder");
      assert.equal(decision.normalizedRequest.utmTerm, "");
      assert.equal(decision.normalizedRequest.utmContent, "PlantFinder");
    }
  },
  {
    name: "explicit UTM overrides beat defaults",
    run() {
      const parsed = commandParser.parse("link | client=castle | channel=domain | source=CastleDining | campaign=Ads | term=WinterLunch | content=Dining | url=https://www.castleintheclouds.org/calendar-of-events/category/winter-lunch/");
      const decision = normalizer.normalize(parsed);

      assert.equal(decision.status, "ready");
      assert.equal(decision.normalizedRequest.utmSource, "CastleDining");
      assert.equal(decision.normalizedRequest.utmMedium, "Domain");
      assert.equal(decision.normalizedRequest.utmCampaign, "Ads");
      assert.equal(decision.normalizedRequest.utmTerm, "WinterLunch");
      assert.equal(decision.normalizedRequest.utmContent, "Dining");
      assert.match(decision.normalizedRequest.finalLongUrl, /utm_source=CastleDining/iu);
    }
  },
  {
    name: "explicit UTM override typos are corrected to canonical values",
    run() {
      const parsed = commandParser.parse("link | client=studleys | channel=linkdln | source=LinkdIn | medium=Socaial | campaign=spriung sale | url=https://studleys.com/garden-plants/");
      const decision = normalizer.normalize(parsed);

      assert.equal(decision.status, "ready");
      assert.equal(decision.normalizedRequest.channel, "linkedin");
      assert.equal(decision.normalizedRequest.utmSource, "LinkedIn");
      assert.equal(decision.normalizedRequest.utmMedium, "Social");
      assert.equal(decision.normalizedRequest.utmCampaign, "spring_sale");
      assert.match(decision.normalizedRequest.finalLongUrl, /utm_source=LinkedIn/iu);
      assert.match(decision.normalizedRequest.finalLongUrl, /utm_medium=Social/iu);
    }
  },
  {
    name: "campaign typo correction removes resolved utm warnings",
    run() {
      const decision = normalizer.normalize(ParsedLinkRequest.fromObject({
        client: "studleys",
        channel: "linkedin",
        asset_type: "social",
        campaign_label: "spriung sale",
        utm_source: "LinkedIn",
        utm_medium: "Social",
        utm_campaign: null,
        utm_term: "",
        utm_content: "",
        destination_url: "https://studleys.com/garden-plants/",
        needs_qr: false,
        confidence: 0.9,
        warnings: ["utm_campaign not specified, left null"],
        missing_fields: ["utm_campaign"]
      }));

      assert.equal(decision.status, "ready");
      assert.equal(decision.normalizedRequest.utmCampaign, "spring_sale");
      assert.ok(!decision.normalizedRequest.warnings.includes("utm_campaign not specified, left null"));
      assert.ok(decision.normalizedRequest.warnings.includes('Campaign label corrected to "spring sale".'));
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
    name: "heuristic parser handles the standard natural-language request",
    run() {
      const parsed = heuristicParser.parse("Need an Instagram link for Studleys spring sale to https://studleys.com/perennials");
      const decision = normalizer.normalize(parsed);

      assert.equal(decision.status, "ready");
      assert.equal(decision.normalizedRequest.client, "studleys");
      assert.equal(decision.normalizedRequest.channel, "instagram");
      assert.equal(decision.normalizedRequest.utmCampaign, "spring_sale");
      assert.match(decision.normalizedRequest.finalLongUrl, /utm_source=Instagram/iu);
      assert.match(decision.normalizedRequest.finalLongUrl, /utm_term=/iu);
    }
  },
  {
    name: "heuristic parser recognizes channel aliases",
    run() {
      const parsed = heuristicParser.parse("Please make an ig link for Studley's spring sale to https://studleys.com/perennials");

      assert.equal(parsed.client, "studleys");
      assert.equal(parsed.channel, "instagram");
      assert.equal(parsed.campaignLabel, "spring sale");
      assert.ok(parsed.confidence >= 0.72);
    }
  },
  {
    name: "heuristic parser corrects typoed client and channel mentions",
    run() {
      const parsed = heuristicParser.parse("Please make an instragram link for studleays spring sale to https://studleys.com/perennials");
      const decision = normalizer.normalize(parsed);

      assert.equal(parsed.client, "studleys");
      assert.equal(parsed.channel, "instagram");
      assert.equal(decision.status, "ready");
      assert.equal(decision.normalizedRequest.utmCampaign, "spring_sale");
    }
  },
  {
    name: "rules service builds focused parser context for the likely client",
    run() {
      const context = rulesService.buildParserContext("Need a LinkedIn contact link for Just Flow to https://justflownh.com/#!/contactus");

      assert.equal(context.likely_client?.key, "jf");
      assert.equal(context.likely_channel?.key, "linkedin");
      assert.ok(context.likely_client?.approved_values?.sources.includes("LinkedIn"));
      assert.ok(context.likely_client?.common_combinations?.some((entry) => entry.source === "LinkedIn" && entry.medium === "Social"));
    }
  },
  {
    name: "openai parser uses focused taxonomy context and nullable schema fields",
    async run() {
      const calls = [];
      const parser = new OpenAIParserService({
        async request(method, url, options) {
          calls.push({ method, url, options });
          return {
            statusCode: 200,
            json() {
              return {
                id: "resp_123",
                model: "gpt-4.1-mini-2025-04-14",
                output_text: JSON.stringify({
                  client: null,
                  channel: "linkedin",
                  asset_type: "social",
                  campaign_label: "contact",
                  utm_source: null,
                  utm_medium: null,
                  utm_campaign: null,
                  utm_term: null,
                  utm_content: null,
                  destination_url: "https://justflownh.com/#!/contactus",
                  needs_qr: false,
                  confidence: 0.61,
                  warnings: ["Client was ambiguous."],
                  missing_fields: ["client"]
                })
              };
            }
          };
        }
      }, {
        apiKey: "sk-test",
        model: "gpt-4.1-mini",
        apiBase: "https://api.openai.com/v1",
        temperature: 0.1,
        timeoutMs: 5000
      }, rulesService);

      const parsed = await parser.parse("Need a LinkedIn contact link for Just Flow to https://justflownh.com/#!/contactus");

      assert.equal(parsed.client, null);
      assert.equal(parsed.channel, "linkedin");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, "POST");
      assert.match(calls[0].url, /\/responses$/iu);

      const payload = calls[0].options.json;
      const prompt = payload.input[0].content[0].text;
      assert.match(prompt, /Likely client context:/iu);
      assert.match(prompt, /"key":"jf"/iu);
      assert.match(prompt, /"approved_values"/iu);
      assert.match(prompt, /"common_combinations"/iu);
      assert.deepEqual(payload.text.format.schema.properties.client.type, ["string", "null"]);
      assert.deepEqual(payload.text.format.schema.properties.destination_url.type, ["string", "null"]);
    }
  },
  {
    name: "bitly monthly quota fallback still returns the long UTM link",
    async run() {
      const updates = [];
      const messages = [];
      const workflow = new LinkWorkflowService({
        requestRepository: {
          update(id, fields) {
            updates.push({ id, fields });
          }
        },
        auditLogRepository: {
          log() {}
        },
        rateLimiter: {
          allows() {
            return true;
          }
        },
        linkRequestParser: {
          async parse() {
            return ParsedLinkRequest.fromObject({
              client: "studleys",
              channel: "facebook",
              asset_type: "social",
              campaign_label: "spring sale",
              destination_url: "https://studleys.com/garden-plants/",
              needs_qr: false,
              confidence: 0.95,
              warnings: [],
              missing_fields: []
            });
          }
        },
        requestNormalizer: normalizer,
        fingerprintService,
        linkGenerationService: {
          async generate(normalized, fingerprint) {
            return {
              fingerprint,
              result: {
                fingerprint,
                longUrl: normalized.finalLongUrl,
                shortUrl: null,
                qrUrl: null,
                reusedExisting: false,
                bitlyMetadata: { message: "MONTHLY_ENCODE_LIMIT_REACHED" },
                shortLinkAvailable: false
              },
              bitlyId: null,
              bitlyPayload: { message: "MONTHLY_ENCODE_LIMIT_REACHED" },
              degraded: true,
              degradedReason: "bitly_quota_reached",
              degradedMessage: "Bitly shorten failed with status 429"
            };
          }
        },
        clickUpChatService: {
          async postMessage(channelId, message) {
            messages.push({ channelId, message });
            return {};
          }
        },
        messageFormatter: new MessageFormatter(),
        logger: nullLogger
      });

      await workflow.process(999, {
        channelId: "8cnb218-8094",
        threadMessageId: null,
        deliveryKey: "delivery-999",
        messageText: "facebook link for studleys spring sale to https://studleys.com/garden-plants/",
        toJSON() {
          return {};
        }
      });

      assert.equal(messages.length, 1);
      assert.match(messages[0].message, /Bitly quota was reached/iu);
      assert.match(messages[0].message, /https:\/\/studleys\.com\/garden-plants\/\?utm_source=Facebook&utm_medium=Social&utm_campaign=spring_sale&utm_term=&utm_content=/iu);
      assert.equal(updates.at(-1).fields.status, "completed_without_short_link");
      assert.equal(updates.at(-1).fields.error_code, "bitly_quota_reached");
    }
  },
  {
    name: "env loader fills blank inherited values from the env file",
    run() {
      const tempDir = fs.mkdtempSync(path.join(process.cwd(), ".tmp-env-loader-"));
      const envFile = path.join(tempDir, ".env");
      const originalValue = process.env.TRACKING_SECRET_ENCRYPTION_KEY;

      try {
        fs.writeFileSync(envFile, "TRACKING_SECRET_ENCRYPTION_KEY=test-tracking-secret\n", "utf8");
        process.env.TRACKING_SECRET_ENCRYPTION_KEY = "";

        loadEnvFile(envFile);

        assert.equal(process.env.TRACKING_SECRET_ENCRYPTION_KEY, "test-tracking-secret");
      } finally {
        if (originalValue === undefined) {
          delete process.env.TRACKING_SECRET_ENCRYPTION_KEY;
        } else {
          process.env.TRACKING_SECRET_ENCRYPTION_KEY = originalValue;
        }

        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  },
  {
    name: "failed duplicate delivery is retried instead of deduplicated",
    async run() {
      const processed = [];
      const updates = [];
      const event = {
        deliveryKey: "dup-123",
        workspaceId: "901234",
        channelId: "456789",
        messageId: null,
        threadMessageId: null,
        userId: null,
        userName: null,
        messageText: "Need a link",
        rawPayload: {},
        toJSON() {
          return {
            deliveryKey: this.deliveryKey,
            workspaceId: this.workspaceId,
            channelId: this.channelId,
            messageId: this.messageId,
            threadMessageId: this.threadMessageId,
            userId: this.userId,
            userName: this.userName,
            messageText: this.messageText
          };
        }
      };

      const controller = new ClickUpWebhookController({
        payloadMapper: {
          map() {
            return { event, diagnostics: {} };
          }
        },
        webhookVerifier: {
          verify() {
            return { passed: true, reasons: [], diagnostics: {} };
          },
          shouldIgnore() {
            return false;
          }
        },
        requestRepository: {
          findByDeliveryKey() {
            return { id: 42, status: "failed" };
          },
          update(id, fields) {
            updates.push({ id, fields });
          }
        },
        auditLogRepository: {
          log() {}
        },
        workflowService: {
          async process(requestId, retryEvent) {
            processed.push({ requestId, retryEvent });
          }
        },
        logger: nullLogger,
        debugEnabled: false
      });

      const response = await controller.handle({
        method: "POST",
        path: "/webhooks/clickup/chat",
        query: {},
        rawBody: "{\"workspace_id\":\"901234\",\"channel_id\":\"456789\",\"message\":{\"text\":\"Need a link\"}}",
        headers: {},
        parseJson() {
          return {
            ok: true,
            value: {
              workspace_id: "901234",
              channel_id: "456789",
              message: {
                text: "Need a link"
              }
            }
          };
        },
        header() {
          return null;
        }
      });

      const body = JSON.parse(response.body);
      assert.equal(response.statusCode, 200);
      assert.equal(body.status, "accepted");
      assert.equal(body.retried, true);
      assert.equal(body.request_id, 42);

      await new Promise((resolve) => setImmediate(resolve));

      assert.equal(updates.length, 1);
      assert.equal(updates[0].id, 42);
      assert.equal(updates[0].fields.status, "received");
      assert.equal(processed.length, 1);
      assert.equal(processed[0].requestId, 42);
      assert.equal(processed[0].retryEvent.deliveryKey, "dup-123");
    }
  },
  {
    name: "bot-formatted response messages are ignored to prevent loops",
    async run() {
      const controller = new ClickUpWebhookController({
        payloadMapper: {
          map() {
            return {
              event: {
                deliveryKey: "bot-loop-1",
                workspaceId: "901234",
                channelId: "456789",
                messageId: "msg-1",
                threadMessageId: null,
                userId: null,
                userName: null,
                messageText: [
                  "Client: Studleys",
                  "Channel: LinkedIn",
                  "Source: LinkedIn",
                  "Medium: Social",
                  "Campaign: spring_sale",
                  "",
                  "UTM:",
                  "https://studleys.com/garden-plants/?utm_source=LinkedIn",
                  "",
                  "Short Link:",
                  "https://bit.ly/test"
                ].join("\n"),
                toJSON() {
                  return {};
                }
              },
              diagnostics: {
                payloadShape: "mixed",
                messageTextFound: true,
                workspaceIdFoundInPayload: true,
                channelIdFoundInPayload: true,
                workspaceIdResolved: "901234",
                channelIdResolved: "456789"
              }
            };
          }
        },
        webhookVerifier: {
          verify() {
            return { passed: true, reasons: [], diagnostics: {} };
          },
          shouldIgnore() {
            return false;
          }
        },
        requestRepository: {
          findByDeliveryKey() {
            throw new Error("requestRepository should not be reached for bot loop messages");
          }
        },
        auditLogRepository: {
          log() {}
        },
        workflowService: {
          async process() {}
        },
        logger: nullLogger,
        debugEnabled: false
      });

      const response = await controller.handle({
        method: "POST",
        path: "/webhooks/clickup/chat",
        query: {},
        rawBody: "{\"ok\":true}",
        headers: {},
        parseJson() {
          return {
            ok: true,
            value: { ok: true }
          };
        },
        header() {
          return null;
        }
      });

      const body = JSON.parse(response.body);
      assert.equal(response.statusCode, 200);
      assert.equal(body.status, "ignored");
      assert.equal(body.reason, "bot_response_loop_prevented");
    }
  },
  {
    name: "basic auth service challenges missing credentials and accepts correct ones",
    run() {
      const auth = new BasicAuthService({
        enabled: true,
        username: "justflow",
        password: "preview",
        realm: "JF Link Manager"
      });

      const challenge = auth.protect({
        header() {
          return null;
        }
      });

      assert.ok(challenge);
      assert.equal(challenge.statusCode, 401);
      assert.match(challenge.headers["WWW-Authenticate"], /Basic realm="JF Link Manager"/iu);

      const allowed = auth.protect({
        header(name) {
          if (name !== "authorization") {
            return null;
          }

          return `Basic ${Buffer.from("justflow:preview").toString("base64")}`;
        }
      });

      assert.equal(allowed, null);
    }
  },
  {
    name: "rate limiter blocks exactly at the configured limit",
    run() {
      const limiter = new RateLimiter({
        countRecentByActorChannel() {
          return 20;
        }
      }, 20, 300);

      assert.equal(limiter.allows({
        userId: "user-1",
        channelId: "channel-1"
      }), false);
    }
  },
  {
    name: "clickup chat service does not retry message posts automatically",
    async run() {
      const calls = [];
      const service = new ClickUpChatService({
        async request(method, url, options) {
          calls.push({ method, url, options });
          return {
            statusCode: 200,
            json() {
              return { id: "message-1" };
            }
          };
        }
      }, {
        apiToken: "pk_test",
        workspaceId: "901234",
        apiBase: "https://api.clickup.com/api/v3",
        messageContentField: "content",
        messageFallbackField: "text_content",
        timeoutMs: 8000
      });

      const response = await service.postMessage("456789", "Hello world");

      assert.equal(response.id, "message-1");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].options.retries, 0);
    }
  },
  {
    name: "received request recovery service processes stale received requests only",
    async run() {
      const database = new DatabaseSync(":memory:");
      database.exec(fs.readFileSync(new URL("../database/migrations/001_init.sql", import.meta.url), "utf8"));
      const requestRepository = new RequestRepository(database);
      const processed = [];
      const staleTimestamp = "2026-03-16T11:00:00.000Z";
      const freshTimestamp = new Date().toISOString();
      const staleRequestId = requestRepository.createIncoming({
        requestUuid: "recovery-stale",
        deliveryKey: "recovery-stale",
        status: "received",
        originalMessage: "Need a LinkedIn link for Studleys spring sale to https://studleys.com/garden-plants/",
        rawPayload: {
          workspace_id: "901234"
        },
        clickupWorkspaceId: "901234",
        clickupChannelId: "456789",
        clickupMessageId: "msg-stale",
        createdAt: staleTimestamp,
        updatedAt: staleTimestamp
      });
      const freshRequestId = requestRepository.createIncoming({
        requestUuid: "recovery-fresh",
        deliveryKey: "recovery-fresh",
        status: "received",
        originalMessage: "Need a Facebook link for Studleys spring sale to https://studleys.com/perennials/",
        rawPayload: {
          workspace_id: "901234"
        },
        clickupWorkspaceId: "901234",
        clickupChannelId: "456789",
        clickupMessageId: "msg-fresh",
        createdAt: freshTimestamp,
        updatedAt: freshTimestamp
      });

      const recoveryService = new ReceivedRequestRecoveryService({
        requestRepository,
        auditLogRepository: {
          log() {}
        },
        workflowService: {
          async process(requestId, event, context) {
            processed.push({ requestId, event, context });
            requestRepository.update(requestId, {
              status: "completed"
            });
          }
        },
        logger: nullLogger,
        enabled: true,
        intervalMs: 30000,
        graceSeconds: 30,
        batchSize: 10
      });

      await recoveryService.recoverPending();

      assert.equal(processed.length, 1);
      assert.equal(processed[0].requestId, staleRequestId);
      assert.equal(processed[0].event.deliveryKey, "recovery-stale");
      assert.equal(processed[0].event.channelId, "456789");
      assert.match(processed[0].context.correlationId, /^recovery-/u);

      const staleRow = database.prepare("SELECT status FROM requests WHERE id = ?").get(staleRequestId);
      const freshRow = database.prepare("SELECT status FROM requests WHERE id = ?").get(freshRequestId);
      assert.equal(staleRow.status, "completed");
      assert.equal(freshRow.status, "received");
    }
  },
  {
    name: "utm library service lists unique tracked links with request counts",
    run() {
      const database = new DatabaseSync(":memory:");
      database.exec(fs.readFileSync(new URL("../database/migrations/001_init.sql", import.meta.url), "utf8"));
      const repository = new RequestRepository(database);
      const libraryService = new UtmLibraryService(repository);
      const timestampA = "2026-03-12T10:00:00.000Z";
      const timestampB = "2026-03-13T10:00:00.000Z";
      const timestampC = "2026-03-13T12:00:00.000Z";
      const firstId = repository.createIncoming({
        requestUuid: "req-1",
        deliveryKey: "delivery-1",
        status: "received",
        originalMessage: "Need a Studleys link",
        rawPayload: {},
        createdAt: timestampA,
        updatedAt: timestampA
      });
      const secondId = repository.createIncoming({
        requestUuid: "req-2",
        deliveryKey: "delivery-2",
        status: "received",
        originalMessage: "Need that same Studleys link again",
        rawPayload: {},
        createdAt: timestampB,
        updatedAt: timestampB
      });
      const thirdId = repository.createIncoming({
        requestUuid: "req-3",
        deliveryKey: "delivery-3",
        status: "received",
        originalMessage: "Need a Castle domain link",
        rawPayload: {},
        createdAt: timestampC,
        updatedAt: timestampC
      });

      repository.update(firstId, {
        status: "completed",
        fingerprint: "fp-1",
        normalized_payload: {
          client: "studleys",
          client_display_name: "Studleys",
          channel: "linkedin",
          channel_display_name: "LinkedIn",
          asset_type: "social",
          campaign_label: "spring sale",
          canonical_campaign: "spring_sale",
          destination_url: "https://studleys.com/garden-plants/",
          normalized_destination_url: "https://studleys.com/garden-plants/",
          utm_source: "LinkedIn",
          utm_medium: "Social",
          utm_campaign: "spring_sale",
          utm_term: "",
          utm_content: "",
          final_long_url: "https://studleys.com/garden-plants/?utm_source=LinkedIn&utm_medium=Social&utm_campaign=spring_sale&utm_term=&utm_content="
        },
        final_long_url: "https://studleys.com/garden-plants/?utm_source=LinkedIn&utm_medium=Social&utm_campaign=spring_sale&utm_term=&utm_content=",
        short_url: "https://bit.ly/a1"
      });
      repository.update(secondId, {
        status: "completed",
        fingerprint: "fp-1",
        normalized_payload: {
          client: "studleys",
          client_display_name: "Studleys",
          channel: "linkedin",
          channel_display_name: "LinkedIn",
          asset_type: "social",
          campaign_label: "spring sale",
          canonical_campaign: "spring_sale",
          destination_url: "https://studleys.com/garden-plants/",
          normalized_destination_url: "https://studleys.com/garden-plants/",
          utm_source: "LinkedIn",
          utm_medium: "Social",
          utm_campaign: "spring_sale",
          utm_term: "",
          utm_content: "",
          final_long_url: "https://studleys.com/garden-plants/?utm_source=LinkedIn&utm_medium=Social&utm_campaign=spring_sale&utm_term=&utm_content="
        },
        final_long_url: "https://studleys.com/garden-plants/?utm_source=LinkedIn&utm_medium=Social&utm_campaign=spring_sale&utm_term=&utm_content=",
        short_url: "https://bit.ly/a1",
        reused_existing: 1
      });
      repository.update(thirdId, {
        status: "completed_without_short_link",
        fingerprint: "fp-2",
        normalized_payload: {
          client: "castle",
          client_display_name: "Castle",
          channel: "domain",
          channel_display_name: "Domain",
          asset_type: "owned",
          campaign_label: "ads",
          canonical_campaign: "Ads",
          destination_url: "https://www.castleintheclouds.org/",
          normalized_destination_url: "https://www.castleintheclouds.org/",
          utm_source: "CastleAdventure",
          utm_medium: "Domain",
          utm_campaign: "Ads",
          utm_term: "HomePage",
          utm_content: "Visitation",
          final_long_url: "https://www.castleintheclouds.org/?utm_source=CastleAdventure&utm_medium=Domain&utm_campaign=Ads&utm_term=HomePage&utm_content=Visitation"
        },
        final_long_url: "https://www.castleintheclouds.org/?utm_source=CastleAdventure&utm_medium=Domain&utm_campaign=Ads&utm_term=HomePage&utm_content=Visitation",
        warnings: ["Bitly monthly quota was reached, so no short link was created."]
      });

      const library = libraryService.list({});
      const filtered = libraryService.list({
        source: "LinkedIn",
        short_link: "with_short_link",
        qr: "without_qr",
        sort: "client"
      });

      assert.equal(library.summary.totalUniqueLinks, 2);
      assert.equal(library.items.length, 2);
      assert.equal(library.summary.withQr, 0);
      assert.equal(library.summary.withoutShortLink, 1);
      assert.equal(library.items[0].client, "castle");
      assert.equal(library.items[0].status, "completed_without_short_link");
      assert.equal(library.items[0].shortUrl, "");
      assert.equal(library.items[1].client, "studleys");
      assert.equal(library.items[1].requestCount, 2);
      assert.equal(library.items[1].utmCampaign, "spring_sale");
      assert.equal(filtered.items.length, 1);
      assert.equal(filtered.items[0].client, "studleys");
      assert.equal(filtered.filters.source, "LinkedIn");
      assert.equal(filtered.filters.shortLink, "with_short_link");
      assert.equal(filtered.filters.qr, "without_qr");
    }
  },
  {
    name: "utm library editor regenerates a reused link and backfills missing qr",
    async run() {
      const database = new DatabaseSync(":memory:");
      database.exec(fs.readFileSync(new URL("../database/migrations/001_init.sql", import.meta.url), "utf8"));
      const requestRepository = new RequestRepository(database);
      const generatedLinkRepository = new GeneratedLinkRepository(database);
      const editorService = new UtmLibraryEditorService({
        requestRepository,
        requestNormalizer: normalizer,
        fingerprintService,
        generatedLinkRepository,
        linkGenerationService: new LinkGenerationService({
          generatedLinkRepository,
          bitlyService: {
            async shorten() {
              throw new Error("Bitly should not be called for an existing fingerprint.");
            }
          },
          qrCodeService: {
            generateUrl(url) {
              return `qr:${url}`;
            }
          }
        })
      });

      const normalizedDecision = normalizer.normalize(ParsedLinkRequest.fromObject({
        client: "studleys",
        channel: "linkedin",
        campaign_label: "spring sale",
        utm_source: "LinkedIn",
        utm_medium: "Social",
        utm_campaign: "spring_sale",
        utm_term: "",
        utm_content: "",
        destination_url: "https://studleys.com/garden-plants/",
        needs_qr: false,
        confidence: 1
      }));
      assert.equal(normalizedDecision.status, "ready");

      const normalized = normalizedDecision.normalizedRequest;
      const fingerprint = fingerprintService.generate(normalized);
      generatedLinkRepository.create({
        fingerprint,
        client: normalized.client,
        channel: normalized.channel,
        assetType: normalized.assetType,
        normalizedDestinationUrl: normalized.normalizedDestinationUrl,
        canonicalCampaign: normalized.canonicalCampaign,
        finalLongUrl: normalized.finalLongUrl,
        shortUrl: "https://bit.ly/existing",
        qrUrl: null,
        bitlyId: "bitly-id",
        bitlyPayload: { link: "https://bit.ly/existing" },
        createdAt: "2026-03-13T12:00:00.000Z",
        updatedAt: "2026-03-13T12:00:00.000Z"
      });

      const result = await editorService.regenerate({
        original_request_id: 55,
        client: "studleys",
        channel: "linkedin",
        campaign_label: "spring sale",
        utm_source: "LinkedIn",
        utm_medium: "Social",
        utm_campaign: "spring_sale",
        utm_term: "",
        utm_content: "",
        destination_url: "https://studleys.com/garden-plants/",
        needs_qr: true
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, "completed");
      assert.equal(result.result.reusedExisting, true);
      assert.equal(result.result.qrUrl, "qr:https://bit.ly/existing");

      const generatedRow = generatedLinkRepository.findByFingerprint(fingerprint);
      assert.equal(generatedRow.qr_url, "qr:https://bit.ly/existing");

      const requestRow = database.prepare("SELECT status, qr_url, reused_existing FROM requests WHERE id = ?").get(result.requestId);
      assert.equal(requestRow.status, "completed");
      assert.equal(requestRow.qr_url, "qr:https://bit.ly/existing");
      assert.equal(requestRow.reused_existing, 1);
    }
  },
  {
    name: "utm library editor deletes one deduped library entry and orphaned cached link",
    async run() {
      const database = new DatabaseSync(":memory:");
      database.exec(fs.readFileSync(new URL("../database/migrations/001_init.sql", import.meta.url), "utf8"));
      const requestRepository = new RequestRepository(database);
      const generatedLinkRepository = new GeneratedLinkRepository(database);
      const editorService = new UtmLibraryEditorService({
        requestRepository,
        requestNormalizer: normalizer,
        fingerprintService,
        generatedLinkRepository,
        linkGenerationService: {
          async generate() {
            throw new Error("generate should not be called while deleting");
          }
        }
      });

      const deletedDecision = normalizer.normalize(ParsedLinkRequest.fromObject({
        client: "studleys",
        channel: "linkedin",
        campaign_label: "spring sale",
        destination_url: "https://studleys.com/garden-plants/",
        needs_qr: false,
        confidence: 1
      }));
      const keptDecision = normalizer.normalize(ParsedLinkRequest.fromObject({
        client: "castle",
        channel: "website",
        campaign_label: "winter lunch",
        destination_url: "https://www.castleintheclouds.org/calendar-of-events/category/winter-lunch/",
        needs_qr: false,
        confidence: 1
      }));
      assert.equal(deletedDecision.status, "ready");
      assert.equal(keptDecision.status, "ready");

      const deletedNormalized = deletedDecision.normalizedRequest;
      const keptNormalized = keptDecision.normalizedRequest;
      const deletedFingerprint = fingerprintService.generate(deletedNormalized);
      const keptFingerprint = fingerprintService.generate(keptNormalized);
      const timestamp = "2026-03-16T15:00:00.000Z";

      generatedLinkRepository.create({
        fingerprint: deletedFingerprint,
        client: deletedNormalized.client,
        channel: deletedNormalized.channel,
        assetType: deletedNormalized.assetType,
        normalizedDestinationUrl: deletedNormalized.normalizedDestinationUrl,
        canonicalCampaign: deletedNormalized.canonicalCampaign,
        finalLongUrl: deletedNormalized.finalLongUrl,
        shortUrl: "https://bit.ly/delete-me",
        qrUrl: "qr:https://bit.ly/delete-me",
        bitlyId: "bitly-delete",
        bitlyPayload: { link: "https://bit.ly/delete-me" },
        createdAt: timestamp,
        updatedAt: timestamp
      });
      generatedLinkRepository.create({
        fingerprint: keptFingerprint,
        client: keptNormalized.client,
        channel: keptNormalized.channel,
        assetType: keptNormalized.assetType,
        normalizedDestinationUrl: keptNormalized.normalizedDestinationUrl,
        canonicalCampaign: keptNormalized.canonicalCampaign,
        finalLongUrl: keptNormalized.finalLongUrl,
        shortUrl: "https://bit.ly/keep-me",
        qrUrl: null,
        bitlyId: "bitly-keep",
        bitlyPayload: { link: "https://bit.ly/keep-me" },
        createdAt: timestamp,
        updatedAt: timestamp
      });

      const deletedRequestOne = requestRepository.createIncoming({
        requestUuid: "delete-1",
        deliveryKey: "delete-1",
        status: "received",
        originalMessage: "Delete request 1",
        rawPayload: {},
        sourceUserId: "tester",
        sourceUserName: "Tester",
        createdAt: timestamp,
        updatedAt: timestamp
      });
      requestRepository.update(deletedRequestOne, {
        status: "completed",
        fingerprint: deletedFingerprint,
        final_long_url: deletedNormalized.finalLongUrl,
        normalized_payload: deletedNormalized.toJSON(),
        short_url: "https://bit.ly/delete-me",
        qr_url: "qr:https://bit.ly/delete-me"
      });

      const deletedRequestTwo = requestRepository.createIncoming({
        requestUuid: "delete-2",
        deliveryKey: "delete-2",
        status: "received",
        originalMessage: "Delete request 2",
        rawPayload: {},
        sourceUserId: "tester",
        sourceUserName: "Tester",
        createdAt: timestamp,
        updatedAt: timestamp
      });
      requestRepository.update(deletedRequestTwo, {
        status: "completed",
        fingerprint: deletedFingerprint,
        final_long_url: deletedNormalized.finalLongUrl,
        normalized_payload: deletedNormalized.toJSON(),
        short_url: "https://bit.ly/delete-me",
        qr_url: "qr:https://bit.ly/delete-me"
      });

      const keptRequest = requestRepository.createIncoming({
        requestUuid: "keep-1",
        deliveryKey: "keep-1",
        status: "received",
        originalMessage: "Keep request",
        rawPayload: {},
        sourceUserId: "tester",
        sourceUserName: "Tester",
        createdAt: timestamp,
        updatedAt: timestamp
      });
      requestRepository.update(keptRequest, {
        status: "completed",
        fingerprint: keptFingerprint,
        final_long_url: keptNormalized.finalLongUrl,
        normalized_payload: keptNormalized.toJSON(),
        short_url: "https://bit.ly/keep-me"
      });

      const result = await editorService.deleteEntry({
        request_id: deletedRequestTwo
      });

      assert.equal(result.ok, true);
      assert.equal(result.deletedRequests, 2);
      assert.equal(requestRepository.findById(deletedRequestOne), null);
      assert.equal(requestRepository.findById(deletedRequestTwo), null);
      assert.ok(requestRepository.findById(keptRequest));
      assert.equal(generatedLinkRepository.findByFingerprint(deletedFingerprint), null);
      assert.ok(generatedLinkRepository.findByFingerprint(keptFingerprint));
    }
  },
  {
    name: "tracker import service imports workbook rows into requests and generated links",
    run() {
      const database = new DatabaseSync(":memory:");
      database.exec(fs.readFileSync(new URL("../database/migrations/001_init.sql", import.meta.url), "utf8"));
      const requestRepository = new RequestRepository(database);
      const generatedLinkRepository = new GeneratedLinkRepository(database);
      const libraryService = new UtmLibraryService(requestRepository);
      const trackerImportService = new TrackerImportService({
        workbookReader: new XlsxWorkbookReader(),
        requestRepository,
        generatedLinkRepository,
        rulesService,
        fingerprintService,
        urlService,
        qrCodeService: {
          generateUrl(url) {
            return `qr:${url}`;
          }
        }
      });
      const workbookBase64 = buildWorkbookFixtureBase64({
        sheets: [
          {
            name: "SFG",
            rows: [
              buildTrackerHeaderRow(),
              [
                "260109.0",
                "https://studleys.com/perennials?color=red",
                "LinkedIn",
                "Social",
                "spring_sale",
                "",
                "Contact",
                "https://studleys.com/perennials/?utm_source=bad",
                "https://bit.ly/imported1",
                "SFG"
              ]
            ]
          },
          {
            name: "PracticeTab",
            rows: [
              buildTrackerHeaderRow(),
              [
                "260109.0",
                "https://example.com/practice",
                "LinkedIn",
                "Social",
                "practice_campaign",
                "",
                "",
                "",
                "https://bit.ly/practice",
                "SFG"
              ]
            ]
          }
        ]
      });

      const firstImport = trackerImportService.importFiles([{
        name: "260109-JF-UTM-Tracker.xlsx",
        content_base64: workbookBase64
      }]);

      assert.equal(firstImport.summary.attempted, 1);
      assert.equal(firstImport.summary.imported, 1);
      assert.equal(firstImport.summary.skipped, 0);
      assert.equal(firstImport.summary.errors, 0);
      assert.equal(firstImport.files[0].sheets[0].name, "SFG");

      const row = database.prepare(`
        SELECT id, status, fingerprint, final_long_url, short_url, source_user_id, created_at
        FROM requests
        WHERE delivery_key LIKE 'import:%'
        LIMIT 1
      `).get();

      assert.equal(row.status, "completed");
      assert.equal(row.short_url, "https://bit.ly/imported1");
      assert.equal(row.source_user_id, "xlsx_import");
      assert.equal(row.created_at, "2026-01-09T12:00:00.000Z");
      assert.equal(
        row.final_long_url,
        "https://studleys.com/perennials?color=red&utm_source=LinkedIn&utm_medium=Social&utm_campaign=spring_sale&utm_term=&utm_content=Contact"
      );

      const requestPayload = JSON.parse(database.prepare("SELECT normalized_payload FROM requests WHERE id = ?").get(row.id).normalized_payload);
      assert.equal(requestPayload.client, "studleys");
      assert.equal(requestPayload.channel, "linkedin");
      assert.equal(requestPayload.utm_content, "Contact");

      const generatedRow = generatedLinkRepository.findByFingerprint(row.fingerprint);
      assert.ok(generatedRow);
      assert.equal(generatedRow.short_url, "https://bit.ly/imported1");
      assert.equal(generatedRow.final_long_url, row.final_long_url);

      const library = libraryService.list({});
      assert.equal(library.summary.totalUniqueLinks, 1);
      assert.equal(library.items[0].client, "studleys");
      assert.equal(library.items[0].utmSource, "LinkedIn");
      assert.equal(library.items[0].utmContent, "Contact");

      const secondImport = trackerImportService.importFiles([{
        name: "260109-JF-UTM-Tracker.xlsx",
        content_base64: workbookBase64
      }]);

      assert.equal(secondImport.summary.attempted, 1);
      assert.equal(secondImport.summary.imported, 0);
      assert.equal(secondImport.summary.skipped, 1);
      assert.equal(secondImport.summary.errors, 0);
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM requests").get().count, 1);
    }
  },
  {
    name: "tracker import service skips duplicate workbook links and backfills missing short links",
    run() {
      const database = new DatabaseSync(":memory:");
      database.exec(fs.readFileSync(new URL("../database/migrations/001_init.sql", import.meta.url), "utf8"));
      const requestRepository = new RequestRepository(database);
      const generatedLinkRepository = new GeneratedLinkRepository(database);
      const trackerImportService = new TrackerImportService({
        workbookReader: new XlsxWorkbookReader(),
        requestRepository,
        generatedLinkRepository,
        rulesService,
        fingerprintService,
        urlService,
        qrCodeService: {
          generateUrl(url) {
            return `qr:${url}`;
          }
        }
      });
      const workbookBase64 = buildWorkbookFixtureBase64({
        sheets: [{
          name: "SFG",
          rows: [
            buildTrackerHeaderRow(),
            [
              "260109.0",
              "https://studleys.com/perennials",
              "LinkedIn",
              "Social",
              "spring_sale",
              "",
              "Contact",
              "",
              "",
              "SFG"
            ],
            [
              "260110.0",
              "https://studleys.com/perennials",
              "LinkedIn",
              "Social",
              "spring_sale",
              "",
              "Contact",
              "",
              "https://bit.ly/imported-dupe",
              "SFG"
            ]
          ]
        }]
      });

      const result = trackerImportService.importFiles([{
        name: "dedupe.xlsx",
        content_base64: workbookBase64
      }]);

      assert.equal(result.summary.attempted, 2);
      assert.equal(result.summary.imported, 1);
      assert.equal(result.summary.skipped, 1);
      assert.equal(result.summary.errors, 0);

      const requestRow = database.prepare(`
        SELECT status, short_url, qr_url
        FROM requests
        WHERE delivery_key LIKE 'import:%'
        LIMIT 1
      `).get();
      assert.equal(requestRow.status, "completed");
      assert.equal(requestRow.short_url, "https://bit.ly/imported-dupe");
      assert.equal(requestRow.qr_url, null);

      const generatedCount = database.prepare("SELECT COUNT(*) AS count FROM generated_links").get().count;
      assert.equal(generatedCount, 1);
      const generatedRow = database.prepare("SELECT short_url FROM generated_links LIMIT 1").get();
      assert.equal(generatedRow.short_url, "https://bit.ly/imported-dupe");
    }
  },
  {
    name: "tracker import service resets imported requests and unreferenced import-seeded links",
    run() {
      const database = new DatabaseSync(":memory:");
      database.exec(fs.readFileSync(new URL("../database/migrations/001_init.sql", import.meta.url), "utf8"));
      const requestRepository = new RequestRepository(database);
      const generatedLinkRepository = new GeneratedLinkRepository(database);
      const trackerImportService = new TrackerImportService({
        workbookReader: new XlsxWorkbookReader(),
        requestRepository,
        generatedLinkRepository,
        rulesService,
        fingerprintService,
        urlService,
        qrCodeService: {
          generateUrl(url) {
            return `qr:${url}`;
          }
        }
      });

      const importedDecision = normalizer.normalize(ParsedLinkRequest.fromObject({
        client: "studleys",
        channel: "linkedin",
        asset_type: "social",
        campaign_label: "spring sale",
        utm_source: "LinkedIn",
        utm_medium: "Social",
        utm_campaign: "spring_sale",
        utm_term: "",
        utm_content: "Contact",
        destination_url: "https://studleys.com/perennials",
        needs_qr: false,
        confidence: 1,
        warnings: [],
        missing_fields: []
      }));
      assert.equal(importedDecision.status, "ready");
      const imported = importedDecision.normalizedRequest;
      const importedFingerprint = fingerprintService.generate(imported);
      const importedRequestId = requestRepository.createIncoming({
        requestUuid: "import-reset-1",
        deliveryKey: "import:1",
        status: "completed",
        originalMessage: "Imported row 1",
        rawPayload: { source: "xlsx_import" },
        sourceUserId: "xlsx_import",
        sourceUserName: "XLSX Import",
        createdAt: "2026-03-10T12:00:00.000Z",
        updatedAt: "2026-03-10T12:00:00.000Z"
      });
      requestRepository.update(importedRequestId, {
        fingerprint: importedFingerprint,
        normalized_payload: imported.toJSON(),
        final_long_url: imported.finalLongUrl,
        short_url: "https://bit.ly/import-reset"
      });
      generatedLinkRepository.create({
        fingerprint: importedFingerprint,
        client: imported.client,
        channel: imported.channel,
        assetType: imported.assetType,
        normalizedDestinationUrl: imported.normalizedDestinationUrl,
        canonicalCampaign: imported.canonicalCampaign,
        finalLongUrl: imported.finalLongUrl,
        shortUrl: "https://bit.ly/import-reset",
        qrUrl: null,
        bitlyId: null,
        bitlyPayload: { imported: true },
        createdAt: "2026-03-10T12:00:00.000Z",
        updatedAt: "2026-03-10T12:00:00.000Z"
      });

      const sharedDecision = normalizer.normalize(ParsedLinkRequest.fromObject({
        client: "studleys",
        channel: "facebook",
        asset_type: "social",
        campaign_label: "spring sale",
        utm_source: "Facebook",
        utm_medium: "Social",
        utm_campaign: "spring_sale",
        utm_term: "",
        utm_content: "",
        destination_url: "https://studleys.com/garden-plants/",
        needs_qr: false,
        confidence: 1,
        warnings: [],
        missing_fields: []
      }));
      assert.equal(sharedDecision.status, "ready");
      const shared = sharedDecision.normalizedRequest;
      const sharedFingerprint = fingerprintService.generate(shared);
      const sharedImportedRequestId = requestRepository.createIncoming({
        requestUuid: "import-reset-2",
        deliveryKey: "import:2",
        status: "completed",
        originalMessage: "Imported row 2",
        rawPayload: { source: "xlsx_import" },
        sourceUserId: "xlsx_import",
        sourceUserName: "XLSX Import",
        createdAt: "2026-03-10T12:05:00.000Z",
        updatedAt: "2026-03-10T12:05:00.000Z"
      });
      requestRepository.update(sharedImportedRequestId, {
        fingerprint: sharedFingerprint,
        normalized_payload: shared.toJSON(),
        final_long_url: shared.finalLongUrl,
        short_url: "https://bit.ly/shared-reset"
      });
      const manualSharedRequestId = requestRepository.createIncoming({
        requestUuid: "manual-shared-1",
        deliveryKey: "manual:1",
        status: "completed",
        originalMessage: "Manual row",
        rawPayload: {},
        sourceUserId: "user-1",
        createdAt: "2026-03-10T12:06:00.000Z",
        updatedAt: "2026-03-10T12:06:00.000Z"
      });
      requestRepository.update(manualSharedRequestId, {
        fingerprint: sharedFingerprint,
        normalized_payload: shared.toJSON(),
        final_long_url: shared.finalLongUrl,
        short_url: "https://bit.ly/shared-reset"
      });
      generatedLinkRepository.create({
        fingerprint: sharedFingerprint,
        client: shared.client,
        channel: shared.channel,
        assetType: shared.assetType,
        normalizedDestinationUrl: shared.normalizedDestinationUrl,
        canonicalCampaign: shared.canonicalCampaign,
        finalLongUrl: shared.finalLongUrl,
        shortUrl: "https://bit.ly/shared-reset",
        qrUrl: null,
        bitlyId: null,
        bitlyPayload: { imported: true },
        createdAt: "2026-03-10T12:05:00.000Z",
        updatedAt: "2026-03-10T12:05:00.000Z"
      });

      assert.deepEqual(trackerImportService.getImportInventory(), {
        importedRequests: 2,
        importedGeneratedLinks: 2
      });

      const reset = trackerImportService.resetImports();
      assert.deepEqual(reset, {
        deletedRequests: 2,
        deletedGeneratedLinks: 1
      });
      assert.deepEqual(trackerImportService.getImportInventory(), {
        importedRequests: 0,
        importedGeneratedLinks: 1
      });
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM requests").get().count, 1);
      assert.equal(database.prepare("SELECT COUNT(*) AS count FROM generated_links").get().count, 1);
      assert.equal(generatedLinkRepository.findByFingerprint(importedFingerprint), null);
      assert.ok(generatedLinkRepository.findByFingerprint(sharedFingerprint));
    }
  },
  {
    name: "utm import controller renders html and validates uploads",
    async run() {
      const controller = new UtmImportController({
        trackerImportService: {
          getImportInventory() {
            return {
              importedRequests: 7,
              importedGeneratedLinks: 3
            };
          },
          importFiles(files) {
            assert.equal(files.length, 1);
            assert.equal(files[0].name, "tracker.xlsx");
            return {
              files: [{
                fileName: "tracker.xlsx",
                ok: true,
                message: "Imported 1 row(s) from tracker.xlsx.",
                summary: {
                  attempted: 1,
                  imported: 1,
                  skipped: 0,
                  errors: 0
                },
                sheets: [{
                  name: "SFG",
                  attempted: 1,
                  imported: 1,
                  skipped: 0,
                  errors: 0
                }]
              }],
              summary: {
                attempted: 1,
                imported: 1,
                skipped: 0,
                errors: 0
              }
            };
          },
          resetImports() {
            return {
              deletedRequests: 7,
              deletedGeneratedLinks: 3
            };
          }
        }
      });

      const htmlResponse = await controller.handleHtml();
      const errorResponse = await controller.handleImport({
        parseJson() {
          return {
            ok: true,
            value: {}
          };
        }
      });
      const importResponse = await controller.handleImport({
        parseJson() {
          return {
            ok: true,
            value: {
              files: [{
                name: "tracker.xlsx",
                content_base64: "ZmFrZQ=="
              }]
            }
          };
        }
      });
      const resetResponse = await controller.handleReset();

      assert.equal(htmlResponse.statusCode, 200);
      assert.match(htmlResponse.headers["Content-Type"], /text\/html/iu);
      assert.match(htmlResponse.body, /Import History/iu);
      assert.match(htmlResponse.body, /JF Link Manager/iu);
      assert.match(htmlResponse.body, /Import Files/iu);
      assert.match(htmlResponse.body, /Saved Links/iu);
      assert.match(htmlResponse.body, /Create Link/iu);
      assert.match(htmlResponse.body, /aria-current="page">Import History/iu);
      assert.match(htmlResponse.body, /Delete Imported Links/iu);
      assert.match(htmlResponse.body, />7</u);

      assert.equal(errorResponse.statusCode, 422);
      assert.match(errorResponse.body, /missing_files/iu);

      assert.equal(importResponse.statusCode, 200);
      assert.match(importResponse.body, /Imported 1 row/iu);
      assert.match(importResponse.body, /"status":"ok"/iu);
      assert.equal(resetResponse.statusCode, 200);
      assert.match(resetResponse.body, /"deletedRequests":7/iu);
      assert.match(resetResponse.body, /"deletedGeneratedLinks":3/iu);
    }
  },
  {
    name: "utm library controller renders html and csv exports",
    async run() {
      const controller = new UtmLibraryController({
        utmLibraryService: {
          list() {
            return {
              items: [
                {
                  requestId: 12,
                  status: "completed",
                  client: "studleys",
                  clientDisplayName: "Studleys",
                  channel: "linkedin",
                  channelDisplayName: "LinkedIn",
                  assetType: "social",
                  campaignLabel: "spring sale",
                  canonicalCampaign: "spring_sale",
                  utmSource: "LinkedIn",
                  utmMedium: "Social",
                  utmCampaign: "spring_sale",
                  utmTerm: "",
                  utmContent: "",
                  destinationUrl: "https://studleys.com/garden-plants/",
                  finalLongUrl: "https://studleys.com/garden-plants/?utm_source=LinkedIn&utm_medium=Social&utm_campaign=spring_sale&utm_term=&utm_content=",
                  shortUrl: "https://bit.ly/3NCDteq",
                  qrUrl: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https%3A%2F%2Fbit.ly%2F3NCDteq",
                  hasShortUrl: true,
                  hasQr: true,
                  originalMessage: "Need a LinkedIn link",
                  warnings: [],
                  requestCount: 3,
                  firstCreatedAt: "2026-03-10T09:00:00.000Z",
                  lastCreatedAt: "2026-03-13T11:30:00.000Z",
                  reusedExisting: false
                }
              ],
              available: {
                clients: ["studleys"],
                channels: ["linkedin"],
                sources: ["LinkedIn"],
                mediums: ["Social"],
                statuses: ["all", "completed", "completed_without_short_link"],
                qrStates: ["all", "with_qr", "without_qr"],
                shortLinkStates: ["all", "with_short_link", "without_short_link"],
                sorts: ["recent", "oldest", "client", "campaign", "requests"]
              },
              filters: {
                client: "",
                channel: "",
                source: "",
                medium: "",
                campaign: "",
                status: "all",
                search: "",
                qr: "all",
                shortLink: "all",
                sort: "recent",
                perPage: 24
              },
              pagination: {
                page: 1,
                perPage: 24,
                total: 1,
                pageCount: 1,
                hasPreviousPage: false,
                hasNextPage: false
              },
              summary: {
                totalUniqueLinks: 1,
                filteredLinks: 1,
                requestsRepresented: 3,
                withQr: 1,
                withoutShortLink: 0
              }
            };
          }
        },
        utmLibraryEditorService: {
          async regenerate() {
            return {
              ok: true,
              requestId: 22,
              status: "completed",
              result: {
                reusedExisting: false
              }
            };
          },
          async deleteEntry(input) {
            assert.equal(input.request_id, 12);
            return {
              ok: true,
              deletedRequests: 3
            };
          }
        },
        rulesService: {
          clients() {
            return ["studleys"];
          },
          createChannelCatalog() {
            return [{ key: "linkedin" }];
          }
        }
      });

      const htmlResponse = await controller.handleHtml({
        query: {
          toast: "Saved",
          highlight_request_id: "12"
        }
      });
      const csvResponse = await controller.handleCsv({ query: {} });
      const regenerateResponse = await controller.handleRegenerate({
        parseJson() {
          return {
            ok: true,
            value: {
              client: "studleys"
            }
          };
        }
      });
      const deleteResponse = await controller.handleDelete({
        parseJson() {
          return {
            ok: true,
            value: {
              request_id: 12
            }
          };
        }
      });

      assert.equal(htmlResponse.statusCode, 200);
      assert.match(htmlResponse.headers["Content-Type"], /text\/html/iu);
      assert.match(htmlResponse.body, /Saved Links/iu);
      assert.match(htmlResponse.body, /JF Link Manager/iu);
      assert.match(htmlResponse.body, /spring_sale/iu);
      assert.match(htmlResponse.body, /QR Code And Details/iu);
      assert.match(htmlResponse.body, /create-qr-code/iu);
      assert.match(htmlResponse.body, /Edit this link/iu);
      assert.match(htmlResponse.body, /Short link/iu);
      assert.match(htmlResponse.body, /aria-current="page">Saved Links/iu);
      assert.match(htmlResponse.body, /Import History/iu);
      assert.match(htmlResponse.body, /data-regenerate-form/iu);
      assert.match(htmlResponse.body, /Delete Link/iu);
      assert.match(htmlResponse.body, /\/utms\/delete/iu);
      assert.equal(csvResponse.statusCode, 200);
      assert.match(csvResponse.headers["Content-Type"], /text\/csv/iu);
      assert.match(csvResponse.body, /request_id,status,client/i);
      assert.match(csvResponse.body, /Studleys/i);
      assert.equal(regenerateResponse.statusCode, 200);
      assert.match(regenerateResponse.body, /highlight_request_id=22/iu);
      assert.equal(deleteResponse.statusCode, 200);
      assert.match(deleteResponse.body, /"deleted_requests":3/iu);
      assert.match(deleteResponse.body, /toast=Saved\+link\+deleted/iu);
    }
  },
  {
    name: "utm builder controller renders html and creates tracked links",
    async run() {
      const controller = new UtmBuilderController({
        utmLibraryEditorService: {
          async create(input) {
            assert.equal(input.client, "studleys");
            return {
              ok: true,
              requestId: 31,
              status: "completed_without_short_link",
              normalized: {
                client: "studleys",
                clientDisplayName: "Studleys",
                channel: "linkedin",
                channelDisplayName: "LinkedIn",
                destinationUrl: "https://studleys.com/garden-plants/",
                finalLongUrl: "https://studleys.com/garden-plants/?utm_source=LinkedIn&utm_medium=Social&utm_campaign=spring_sale&utm_term=&utm_content=",
                utmSource: "LinkedIn",
                utmMedium: "Social",
                utmCampaign: "spring_sale",
                utmTerm: "",
                utmContent: "",
                warnings: ["Bitly monthly quota was reached, so no short link was created."]
              },
              result: {
                shortUrl: null,
                qrUrl: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https%3A%2F%2Fstudleys.com",
                reusedExisting: false
              }
            };
          }
        },
        rulesService: {
          createFormCatalog() {
            return [{
              key: "studleys",
              displayName: "Studleys",
              taxonomy: {
                sources: ["Facebook", "LinkedIn"],
                mediums: ["Social"],
                campaigns: ["spring_sale"],
                terms: [""],
                contents: ["Contact"],
                combinations: [{ source: "LinkedIn", medium: "Social", campaign: "spring_sale", term: "", content: "Contact" }]
              }
            }];
          },
          createChannelCatalog() {
            return [{
              key: "linkedin",
              displayName: "LinkedIn",
              assetType: "social",
              requiresQr: false,
              utmDefaults: {
                source: "LinkedIn",
                medium: "Social"
              }
            }];
          }
        }
      });

      const htmlResponse = await controller.handleHtml({});
      const createResponse = await controller.handleCreate({
        parseJson() {
          return {
            ok: true,
            value: {
              client: "studleys",
              destination_url: "https://studleys.com/garden-plants/"
            }
          };
        }
      });

      assert.equal(htmlResponse.statusCode, 200);
      assert.match(htmlResponse.headers["Content-Type"], /text\/html/iu);
      assert.match(htmlResponse.body, /Create Link/iu);
      assert.match(htmlResponse.body, /JF Link Manager/iu);
      assert.match(htmlResponse.body, /Saved Links/iu);
      assert.match(htmlResponse.body, /aria-current="page">Create Link/iu);
      assert.match(htmlResponse.body, /Import History/iu);
      assert.match(htmlResponse.body, /campaign_label/iu);
      assert.match(htmlResponse.body, /Matching options/iu);
      assert.match(htmlResponse.body, /data-combo-field="source"/iu);
      assert.match(htmlResponse.body, /utm_source_custom/iu);
      assert.match(htmlResponse.body, /Use custom UTM values/iu);
      assert.equal(createResponse.statusCode, 200);
      const payload = JSON.parse(createResponse.body);
      assert.equal(payload.status, "ok");
      assert.equal(payload.request_id, 31);
      assert.match(payload.library_url, /highlight_request_id=31/iu);
      assert.equal(payload.result.status, "completed_without_short_link");
      assert.equal(payload.result.utm_source, "LinkedIn");
      assert.equal(payload.result.qr_url.includes("create-qr-code"), true);
    }
  },
  {
    name: "health controller reports ready when database, config, and storage are healthy",
    async run() {
      const tempRoot = fs.mkdtempSync(path.join(process.cwd(), "storage", "health-test-"));
      const config = {
        app: {
          env: "production",
          debug: false
        },
        database: {
          path: path.join(tempRoot, "app.sqlite")
        },
        logging: {
          path: path.join(tempRoot, "app.log")
        },
        openai: {
          apiKey: "sk-test",
          model: "gpt-4.1-mini"
        },
        clickup: {
          apiToken: "pk_test",
          workspaceId: "901234",
          allowedChannelIds: ["456789"],
          webhookSecret: "secret",
          debugWebhook: false,
          debugSkipSignature: false,
          debugSkipChannelCheck: false,
          debugSkipWorkspaceCheck: false
        },
        bitly: {
          accessToken: "bitly-token"
        }
      };
      const controller = new HealthController({
        database: {
          prepare() {
            return {
              get() {
                return { ok: 1 };
              }
            };
          }
        },
        config
      });

      try {
        const response = await controller.handle();
        const body = JSON.parse(response.body);

        assert.equal(response.statusCode, 200);
        assert.equal(body.status, "ok");
        assert.equal(body.checks.database.status, "ok");
        assert.equal(body.checks.configuration.status, "ok");
        assert.equal(body.checks.storage.status, "ok");
        assert.equal(body.errors.length, 0);
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  },
  {
    name: "health controller degrades when required config is missing in production",
    async run() {
      const tempRoot = fs.mkdtempSync(path.join(process.cwd(), "storage", "health-test-"));
      const controller = new HealthController({
        database: {
          prepare() {
            return {
              get() {
                return { ok: 1 };
              }
            };
          }
        },
        config: {
          app: {
            env: "production",
            debug: true
          },
          database: {
            path: path.join(tempRoot, "app.sqlite")
          },
          logging: {
            path: path.join(tempRoot, "app.log")
          },
          openai: {
            apiKey: "",
            model: ""
          },
          clickup: {
            apiToken: "",
            workspaceId: "",
            allowedChannelIds: [],
            webhookSecret: "",
            debugWebhook: true,
            debugSkipSignature: true,
            debugSkipChannelCheck: false,
            debugSkipWorkspaceCheck: true
          },
          bitly: {
            accessToken: ""
          }
        }
      });

      try {
        const response = await controller.handle();
        const body = JSON.parse(response.body);

        assert.equal(response.statusCode, 503);
        assert.equal(body.status, "degraded");
        assert.equal(body.checks.configuration.status, "error");
        assert.ok(body.errors.some((issue) => issue.code === "missing_env"));
        assert.ok(body.errors.some((issue) => issue.code === "missing_channel_allowlist"));
        assert.ok(body.errors.some((issue) => issue.code === "debug_enabled_in_production"));
        assert.ok(body.errors.some((issue) => issue.code === "debug_bypass_enabled_in_production"));
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  },
  {
    name: "health controller warns when library auth uses preview credentials",
    async run() {
      const tempRoot = fs.mkdtempSync(path.join(process.cwd(), "storage", "health-test-"));
      const controller = new HealthController({
        database: {
          prepare() {
            return {
              get() {
                return { ok: 1 };
              }
            };
          }
        },
        config: {
          app: {
            env: "production",
            debug: false
          },
          database: {
            path: path.join(tempRoot, "app.sqlite")
          },
          logging: {
            path: path.join(tempRoot, "app.log")
          },
          openai: {
            apiKey: "sk-test",
            model: "gpt-4.1-mini"
          },
          clickup: {
            apiToken: "pk_test",
            workspaceId: "901234",
            allowedChannelIds: ["456789"],
            webhookSecret: "secret",
            debugWebhook: false,
            debugSkipSignature: false,
            debugSkipChannelCheck: false,
            debugSkipWorkspaceCheck: false
          },
          bitly: {
            accessToken: "bitly-token"
          },
          libraryAuth: {
            enabled: true,
            username: "justflow",
            password: "preview"
          }
        }
      });

      try {
        const response = await controller.handle();
        const body = JSON.parse(response.body);

        assert.equal(response.statusCode, 200);
        assert.equal(body.status, "warning");
        assert.ok(body.warnings.some((issue) => issue.code === "library_auth_default_credentials"));
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
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
    name: "clickup payload mapper supports automation payload nesting and query ids",
    run() {
      const payload = {
        payload: {
          workspace_id: "901234",
          text_content: "Need a LinkedIn link for Studleys spring sale to https://studleys.com/garden-plants/"
        }
      };
      const result = payloadMapper.map(payload, {
        correlationId: "test-correlation",
        requestQuery: {
          channel_id: "456789",
          comment_id: "comment-123"
        }
      });

      assert.equal(result.diagnostics.payloadShape, "payload");
      assert.equal(result.event.workspaceId, "901234");
      assert.equal(result.event.channelId, "456789");
      assert.equal(result.event.messageId, "comment-123");
      assert.equal(result.event.messageText, "Need a LinkedIn link for Studleys spring sale to https://studleys.com/garden-plants/");
      assert.equal(result.diagnostics.matchedPaths.messageText, "payload.text_content");
      assert.equal(result.diagnostics.matchedPaths.channelId, "query.channel_id");
    }
  },
  {
    name: "clickup payload mapper falls back to nested custom message text",
    run() {
      const payload = {
        data: {
          trigger: {
            workspaceId: "901234",
            channelId: "456789",
            customMessage: "Need a LinkedIn link for Studleys spring sale to https://studleys.com/garden-plants/"
          }
        }
      };
      const result = payloadMapper.map(payload, { correlationId: "test-correlation" });

      assert.equal(result.event.workspaceId, "901234");
      assert.equal(result.event.channelId, "456789");
      assert.equal(result.event.messageText, "Need a LinkedIn link for Studleys spring sale to https://studleys.com/garden-plants/");
      assert.equal(result.diagnostics.matchedPaths.messageText, "data.trigger.customMessage");
      assert.equal(result.diagnostics.matchedPaths.workspaceId, "data.trigger.workspaceId");
      assert.equal(result.diagnostics.matchedPaths.channelId, "data.trigger.channelId");
    }
  },
  {
    name: "clickup payload mapper uses payload hash fallback when ids are missing",
    run() {
      const firstPayload = {
        payload: {
          workspace_id: "901234",
          channel_id: "456789",
          text_content: "Need a LinkedIn link for Studleys spring sale to https://studleys.com/garden-plants/",
          sent_at: "2026-03-16T12:00:00Z"
        }
      };
      const secondPayload = {
        payload: {
          workspace_id: "901234",
          channel_id: "456789",
          text_content: "Need a LinkedIn link for Studleys spring sale to https://studleys.com/garden-plants/",
          sent_at: "2026-03-16T12:01:00Z"
        }
      };

      const first = payloadMapper.map(firstPayload, { correlationId: "test-correlation" });
      const second = payloadMapper.map(secondPayload, { correlationId: "test-correlation" });

      assert.notEqual(first.event.deliveryKey, second.event.deliveryKey);
      assert.match(first.event.deliveryKey, /^456789:/u);
      assert.match(second.event.deliveryKey, /^456789:/u);
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
  },
  {
    name: "tracking auth service verifies a valid signed request",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Just Flow",
        website_name: "Main Site",
        base_url: "https://example.com"
      });
      const request = createSignedTrackingRequest({
        authService: context.trackingAuthService,
        publicKey: registration.public_key,
        secretKey: registration.secret_key,
        timestamp: "2026-03-16T12:00:00.000Z",
        body: {
          installation_id: "install-1",
          plugin_version: "1.0.0",
          sent_at: "2026-03-16T12:00:00.000Z",
          events: []
        }
      });

      const verification = context.trackingAuthService.verifyRequest(request, {
        now: new Date("2026-03-16T12:03:00.000Z")
      });

      assert.equal(verification.ok, true);
      assert.equal(verification.website.public_key, registration.public_key);
    }
  },
  {
    name: "tracking auth service rejects invalid signatures",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Just Flow",
        website_name: "Main Site",
        base_url: "https://example.com"
      });
      const request = createSignedTrackingRequest({
        authService: context.trackingAuthService,
        publicKey: registration.public_key,
        secretKey: "jfsk_wrong-secret",
        timestamp: "2026-03-16T12:00:00.000Z",
        body: {
          installation_id: "install-1",
          plugin_version: "1.0.0",
          sent_at: "2026-03-16T12:00:00.000Z",
          events: []
        }
      });

      const verification = context.trackingAuthService.verifyRequest(request, {
        now: new Date("2026-03-16T12:03:00.000Z")
      });

      assert.equal(verification.ok, false);
      assert.equal(verification.statusCode, 403);
      assert.equal(verification.error.code, "invalid_signature");
      const failureRow = context.database.prepare(`
        SELECT event_type, installation_id, error_code
        FROM website_observability_events
        WHERE website_id = :website_id
        ORDER BY id DESC
        LIMIT 1
      `).get({
        website_id: registration.website.id
      });
      assert.equal(failureRow.event_type, "auth_failure");
      assert.equal(failureRow.installation_id, "install-1");
      assert.equal(failureRow.error_code, "invalid_signature");
    }
  },
  {
    name: "tracking auth service rejects stale timestamps",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Just Flow",
        website_name: "Main Site",
        base_url: "https://example.com"
      });
      const request = createSignedTrackingRequest({
        authService: context.trackingAuthService,
        publicKey: registration.public_key,
        secretKey: registration.secret_key,
        timestamp: "2026-03-16T12:00:00.000Z",
        body: {
          installation_id: "install-1",
          plugin_version: "1.0.0",
          sent_at: "2026-03-16T12:00:00.000Z",
          events: []
        }
      });

      const verification = context.trackingAuthService.verifyRequest(request, {
        now: new Date("2026-03-16T12:06:00.000Z")
      });

      assert.equal(verification.ok, false);
      assert.equal(verification.statusCode, 401);
      assert.equal(verification.error.code, "stale_timestamp");
    }
  },
  {
    name: "tracking controller records ingestion failures for invalid batch payloads",
    async run() {
      const context = createTrackingTestContext();
      const nowIso = new Date().toISOString();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Just Flow",
        website_name: "Main Site",
        base_url: "https://example.com"
      });
      const controller = new TrackingController({
        trackingAuthService: context.trackingAuthService,
        trackingIngestionService: context.trackingIngestionService,
        pluginConfigService: new PluginConfigService(),
        websiteRepository: context.websiteRepository,
        pluginTelemetryService: context.pluginTelemetryService,
        websiteObservabilityEventRepository: context.websiteObservabilityEventRepository
      });
      const request = createSignedTrackingRequest({
        authService: context.trackingAuthService,
        publicKey: registration.public_key,
        secretKey: registration.secret_key,
        timestamp: nowIso,
        body: {
          installation_id: "install-invalid",
          plugin_version: "1.0.0",
          sent_at: nowIso
        }
      });

      const response = await controller.handleBatch(request);
      const observabilityRow = context.database.prepare(`
        SELECT event_type, installation_id, error_code
        FROM website_observability_events
        WHERE website_id = :website_id
        ORDER BY id DESC
        LIMIT 1
      `).get({
        website_id: registration.website.id
      });

      assert.equal(response.statusCode, 400);
      assert.equal(observabilityRow.event_type, "ingestion_failure");
      assert.equal(observabilityRow.installation_id, "install-invalid");
      assert.equal(observabilityRow.error_code, "invalid_events");
    }
  },
  {
    name: "website provisioning returns a plain secret once and stores protected credentials",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Client A",
        website_name: "Client A Site",
        base_url: "https://example.com/subdir/",
        config_json: {
          session_timeout_minutes: 45
        }
      });

      const row = context.database.prepare(`
        SELECT public_key, secret_key_hash, secret_key_encrypted, base_url, config_json
        FROM websites
        WHERE id = :id
      `).get({ id: registration.website.id });

      assert.match(registration.secret_key, /^jfsk_/u);
      assert.equal(registration.public_key, row.public_key);
      assert.notEqual(row.secret_key_hash, registration.secret_key);
      assert.notEqual(row.secret_key_encrypted, registration.secret_key);
      assert.equal(row.base_url, "https://example.com/subdir");
      assert.equal(JSON.parse(row.config_json).session_timeout_minutes, 45);
      assert.equal(registration.website.config_json.session_timeout_minutes, 45);
      assert.equal("secret_key" in registration.website, false);
    }
  },
  {
    name: "website provisioning reuses the same client and stores wordpress site context",
    run() {
      const context = createTrackingTestContext();
      const first = context.websiteProvisioningService.createWebsite({
        client_name: "Client A",
        website_name: "Main Site",
        base_url: "https://example.com",
        wordpress: {
          multisite_enabled: true,
          network_id: "network-1",
          network_name: "Client Network",
          site_id: "7",
          site_path: "/marketing/"
        }
      });
      const second = context.websiteProvisioningService.createWebsite({
        client_name: "client a",
        website_name: "Store Site",
        base_url: "https://store.example.com"
      });
      const clients = context.clientRepository.list();
      const firstRow = context.websiteRepository.findById(first.website.id);
      const secondRow = context.websiteRepository.findById(second.website.id);

      assert.equal(clients.length, 1);
      assert.equal(firstRow.client_id, secondRow.client_id);
      assert.equal(first.website.client_id, Number(firstRow.client_id));
      assert.equal(first.website.wordpress.multisite_enabled, true);
      assert.equal(firstRow.wp_multisite_enabled, 1);
      assert.equal(firstRow.wp_network_id, "network-1");
      assert.equal(firstRow.wp_network_name, "Client Network");
      assert.equal(firstRow.wp_site_id, "7");
      assert.equal(firstRow.wp_site_path, "/marketing/");
      assert.equal(second.website.wordpress.multisite_enabled, false);
    }
  },
  {
    name: "website administration rotates and disables credentials with history",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteAdministrationService.createWebsite({
        client_name: "Client A",
        website_name: "Client A Site",
        base_url: "https://example.com"
      });
      const firstPublicKey = registration.public_key;
      const rotation = context.websiteAdministrationService.rotateCredentials(registration.website.id);
      const disabledWebsite = context.websiteAdministrationService.updateWebsiteStatus(registration.website.id, "disabled");
      const credentialEvents = context.websiteCredentialEventRepository.listByWebsiteId(registration.website.id, 10);
      const disabledRow = context.websiteRepository.findById(registration.website.id);
      const oldRequest = createSignedTrackingRequest({
        authService: context.trackingAuthService,
        publicKey: firstPublicKey,
        secretKey: registration.secret_key,
        timestamp: "2026-03-16T12:00:00.000Z",
        body: {
          installation_id: "install-1",
          plugin_version: "1.0.0",
          sent_at: "2026-03-16T12:00:00.000Z",
          events: []
        }
      });
      const verification = context.trackingAuthService.verifyRequest(oldRequest, {
        now: new Date("2026-03-16T12:03:00.000Z")
      });

      assert.notEqual(rotation.public_key, firstPublicKey);
      assert.match(rotation.secret_key, /^jfsk_/u);
      assert.equal(disabledWebsite.status, "disabled");
      assert.equal(Number(disabledRow.credentials_version), 2);
      assert.ok(disabledRow.last_credentials_rotated_at);
      assert.equal(credentialEvents.length, 3);
      assert.ok(credentialEvents.some((row) => row.action === "created"));
      assert.ok(credentialEvents.some((row) => row.action === "rotated"));
      assert.ok(credentialEvents.some((row) => row.action === "disabled"));
      assert.equal(verification.ok, false);
      assert.equal(verification.error.code, "website_not_found");
    }
  },
  {
    name: "website administration dashboard groups websites under the same client",
    run() {
      const context = createTrackingTestContext();
      context.websiteAdministrationService.createWebsite({
        client_name: "Client A",
        website_name: "Main Site",
        base_url: "https://example.com",
        wordpress: {
          multisite_enabled: true,
          network_id: "network-1",
          site_id: "11",
          site_path: "/main/"
        }
      });
      const secondary = context.websiteAdministrationService.createWebsite({
        client_name: "Client A",
        website_name: "Store Site",
        base_url: "https://store.example.com"
      });
      context.websiteAdministrationService.createWebsite({
        client_name: "Client B",
        website_name: "Brand Site",
        base_url: "https://brand.example.com"
      });
      context.websiteAdministrationService.updateWebsiteStatus(secondary.website.id, "disabled");

      const groups = context.websiteAdministrationService.listDashboardData();
      const clientA = groups.find((group) => group.client.client_name === "Client A");
      const clientB = groups.find((group) => group.client.client_name === "Client B");

      assert.equal(groups.length, 2);
      assert.equal(clientA.website_count, 2);
      assert.equal(clientA.active_website_count, 1);
      assert.equal(clientA.disabled_website_count, 1);
      assert.equal(clientA.multisite_website_count, 1);
      assert.equal(clientA.websites.length, 2);
      assert.equal(clientB.website_count, 1);
    }
  },
  {
    name: "website admin html lets operators choose an existing client or add a new one",
    async run() {
      const context = createTrackingTestContext();
      context.websiteAdministrationService.createWebsite({
        client_name: "Client A",
        website_name: "Client A Site",
        base_url: "https://client-a.example.com"
      });
      context.websiteAdministrationService.createWebsite({
        client_name: "Client B",
        website_name: "Client B Site",
        base_url: "https://client-b.example.com"
      });
      const controller = new WebsiteAdminController({
        websiteAdministrationService: context.websiteAdministrationService,
        rulesService
      });

      const response = await controller.handleHtml();

      assert.equal(response.statusCode, 200);
      assert.match(response.body, /Choose Existing Client/iu);
      assert.match(response.body, /Add New Client/iu);
      assert.match(response.body, /Select an existing client/iu);
      assert.match(response.body, /Client A/iu);
      assert.match(response.body, /Client B/iu);
    }
  },
  {
    name: "website admin html falls back to rules clients when no tracked websites exist yet",
    async run() {
      const context = createTrackingTestContext();
      const controller = new WebsiteAdminController({
        websiteAdministrationService: context.websiteAdministrationService,
        rulesService: {
          createFormCatalog() {
            return [
              { key: "alpha", displayName: "Alpha Client" },
              { key: "beta", displayName: "Beta Client" }
            ];
          }
        }
      });

      const response = await controller.handleHtml();

      assert.equal(response.statusCode, 200);
      assert.match(response.body, /Select an existing client/iu);
      assert.match(response.body, /Alpha Client/iu);
      assert.match(response.body, /Beta Client/iu);
      assert.doesNotMatch(response.body, /No clients available yet/iu);
    }
  },
  {
    name: "plugin telemetry records installation versions and history",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteAdministrationService.createWebsite({
        client_name: "Client A",
        website_name: "Client A Site",
        base_url: "https://example.com"
      });
      const website = context.websiteRepository.findById(registration.website.id);

      context.pluginTelemetryService.recordHeartbeat(website, {
        installation_id: "install-1",
        plugin_version: "1.0.0",
        wp_version: "6.8.1",
        php_version: "8.3",
        status: "healthy"
      }, "2026-03-16T12:00:00.000Z");
      context.pluginTelemetryService.recordBatch(website, {
        installation_id: "install-1",
        plugin_version: "1.1.0",
        sent_at: "2026-03-16T12:05:00.000Z",
        events: []
      }, "2026-03-16T12:05:05.000Z");

      const installation = context.websiteInstallationRepository.findByWebsiteAndInstallationId(website.id, "install-1");
      const installationEvents = context.websiteInstallationEventRepository.listByWebsiteId(website.id, 10);

      assert.equal(installation.plugin_version, "1.1.0");
      assert.equal(installation.wp_version, "6.8.1");
      assert.equal(installation.php_version, "8.3");
      assert.equal(installation.status, "healthy");
      assert.equal(installation.last_heartbeat_at, "2026-03-16T12:00:00.000Z");
      assert.equal(installation.last_batch_received_at, "2026-03-16T12:05:05.000Z");
      assert.equal(installation.last_sent_at, "2026-03-16T12:05:00.000Z");
      assert.ok(installationEvents.some((row) => row.event_type === "heartbeat"));
      assert.ok(installationEvents.some((row) => row.event_type === "batch_received"));
      assert.ok(installationEvents.some((row) => row.event_type === "version_changed"));
    }
  },
  {
    name: "plugin telemetry stores wordpress multisite context on installations and websites",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteAdministrationService.createWebsite({
        client_name: "Client A",
        website_name: "Client A Site",
        base_url: "https://example.com"
      });
      const website = context.websiteRepository.findById(registration.website.id);

      context.pluginTelemetryService.recordHeartbeat(website, {
        installation_id: "install-1",
        plugin_version: "1.0.0",
        wp_version: "6.8.1",
        php_version: "8.3",
        status: "healthy",
        wordpress: {
          multisite_enabled: true,
          network_id: "network-22",
          network_name: "Acme Network",
          site_id: "42",
          site_url: "https://example.com/subsite",
          site_path: "/subsite/"
        }
      }, "2026-03-16T12:00:00.000Z");

      const installation = context.websiteInstallationRepository.findByWebsiteAndInstallationId(website.id, "install-1");
      const websiteRow = context.websiteRepository.findById(website.id);

      assert.equal(installation.wp_multisite_enabled, 1);
      assert.equal(installation.wp_network_id, "network-22");
      assert.equal(installation.wp_network_name, "Acme Network");
      assert.equal(installation.wp_site_id, "42");
      assert.equal(installation.wp_site_url, "https://example.com/subsite");
      assert.equal(installation.wp_site_path, "/subsite/");
      assert.equal(websiteRow.wp_multisite_enabled, 1);
      assert.equal(websiteRow.wp_network_id, "network-22");
      assert.equal(websiteRow.wp_site_id, "42");
      assert.equal(websiteRow.wp_site_path, "/subsite/");
    }
  },
  {
    name: "website administration dashboard includes health signals and gap warnings",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteAdministrationService.createWebsite({
        client_name: "Client Health",
        website_name: "Health Site",
        base_url: "https://health.example.com"
      });
      const website = context.websiteRepository.findById(registration.website.id);

      context.pluginTelemetryService.recordConfigFetch(website, {
        installation_id: "install-health",
        plugin_version: "1.2.0"
      }, "2026-03-16T08:00:00.000Z");
      context.pluginTelemetryService.recordHeartbeat(website, {
        installation_id: "install-health",
        plugin_version: "1.2.0",
        wp_version: "6.8.1",
        php_version: "8.3",
        status: "healthy"
      }, "2026-03-16T08:00:00.000Z");
      context.pluginTelemetryService.recordBatch(website, {
        installation_id: "install-health",
        plugin_version: "1.2.0",
        sent_at: "2026-03-15T23:00:00.000Z",
        events: [{
          event_uuid: "conversion-health",
          event_type: "form_submit",
          event_name: "lead_form",
          occurred_at: "2026-03-15T23:00:00.000Z",
          visitor_id: "visitor-health",
          session_id: "session-health",
          page_url: "https://health.example.com/contact",
          page_path: "/contact",
          referrer_url: null,
          utm: {
            source: "google",
            medium: "cpc",
            campaign: "health",
            term: null,
            content: null
          },
          click_ids: {},
          consent: {},
          meta: {
            value: 25
          }
        }]
      }, "2026-03-15T23:05:00.000Z");
      const visitorId = context.visitorRepository.create({
        websiteId: website.id,
        visitorUuid: "visitor-health",
        firstSeenAt: "2026-03-15T23:00:00.000Z",
        lastSeenAt: "2026-03-15T23:00:00.000Z",
        metadataJson: {}
      });
      const sessionId = context.sessionRepository.create({
        websiteId: website.id,
        visitorId,
        sessionUuid: "session-health",
        startedAt: "2026-03-15T23:00:00.000Z",
        endedAt: "2026-03-15T23:00:00.000Z",
        landingPageUrl: "https://health.example.com/contact",
        exitPageUrl: "https://health.example.com/contact",
        referrerUrl: null,
        referrerDomain: null,
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "health",
        pageviews: 1,
        engagementSeconds: 5,
        isEngaged: false,
        createdAt: "2026-03-15T23:00:00.000Z",
        updatedAt: "2026-03-15T23:00:00.000Z"
      });
      context.conversionRepository.insert({
        websiteId: website.id,
        visitorId,
        sessionId,
        conversionUuid: "conversion-health",
        conversionType: "form_submit",
        pageUrl: "https://health.example.com/contact",
        value: 25,
        submittedAt: "2026-03-15T23:00:00.000Z",
        receivedAt: "2026-03-15T23:00:00.000Z"
      });
      context.websiteObservabilityEventRepository.create({
        websiteId: website.id,
        installationId: "install-health",
        pluginVersion: "1.2.0",
        eventType: "auth_failure",
        errorCode: "invalid_signature",
        message: "Invalid signature",
        detailsJson: {},
        occurredAt: "2026-03-16T07:30:00.000Z"
      });
      context.websiteObservabilityEventRepository.create({
        websiteId: website.id,
        installationId: "install-health",
        pluginVersion: "1.2.0",
        eventType: "ingestion_failure",
        errorCode: "tracking_ingestion_failed",
        message: "Tracking batch ingestion failed.",
        detailsJson: {},
        occurredAt: "2026-03-16T07:45:00.000Z"
      });

      const dashboard = context.websiteAdministrationService.listDashboardData({
        referenceTime: new Date("2026-03-16T18:00:00.000Z")
      });
      const entry = dashboard[0].websites[0];

      assert.equal(entry.health.status, "failing");
      assert.equal(entry.health.last_heartbeat_at, "2026-03-16T08:00:00.000Z");
      assert.equal(entry.health.last_batch_received_at, "2026-03-15T23:05:00.000Z");
      assert.equal(entry.health.last_conversion_at, "2026-03-15T23:00:00.000Z");
      assert.equal(entry.health.auth_failure_count, 1);
      assert.equal(entry.health.ingestion_failure_count, 1);
      assert.equal(entry.installations[0].health.status, "failing");
      assert.equal(entry.installations[0].health.auth_failure_count, 1);
      assert.equal(entry.installations[0].health.ingestion_failure_count, 1);
      assert.equal(entry.observability_events.length >= 2, true);
      assert.equal(entry.health.warnings.some((warning) => warning.code === "heartbeat_gap"), true);
      assert.equal(entry.health.warnings.some((warning) => warning.code === "traffic_gap"), true);
    }
  },
  {
    name: "tracking batch ingestion inserts visitors sessions and events",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Client A",
        website_name: "Client A Site",
        base_url: "https://example.com"
      });
      const website = context.websiteRepository.findById(registration.website.id);
      const summary = context.trackingIngestionService.ingestBatch({
        website
      }, {
        installation_id: "install-1",
        plugin_version: "1.0.0",
        sent_at: "2026-03-16T12:00:00.000Z",
        events: [{
          event_uuid: "event-1",
          event_type: "page_view",
          event_name: null,
          occurred_at: "2026-03-16T12:00:00.000Z",
          visitor_id: "visitor-1",
          session_id: "session-1",
          page_url: "https://example.com/landing",
          page_path: "/landing",
          referrer_url: "https://www.google.com/search?q=client+a",
          utm: {
            source: "google",
            medium: "cpc",
            campaign: "spring_launch",
            term: "tracking",
            content: "hero"
          },
          click_ids: {
            gclid: "gclid-1",
            fbclid: null,
            msclkid: null,
            ttclid: null
          },
          meta: {
            channel: "paid_search",
            source_category: "search",
            engagement_seconds: 18
          }
        }]
      });

      assert.equal(summary.received, 1);
      assert.equal(summary.inserted, 1);
      assert.equal(summary.duplicates, 0);
      assert.equal(summary.conversions_created, 0);
      assert.equal(context.database.prepare("SELECT COUNT(*) AS count FROM visitors").get().count, 1);
      assert.equal(context.database.prepare("SELECT COUNT(*) AS count FROM sessions").get().count, 1);
      assert.equal(context.database.prepare("SELECT COUNT(*) AS count FROM tracking_events").get().count, 1);

      const session = context.database.prepare(`
        SELECT pageviews, utm_source, utm_medium, utm_campaign, gclid, channel, source_category
        FROM sessions
        WHERE session_uuid = 'session-1'
      `).get();
      const websiteRow = context.websiteRepository.findById(registration.website.id);

      assert.equal(session.pageviews, 1);
      assert.equal(session.utm_source, "google");
      assert.equal(session.utm_medium, "cpc");
      assert.equal(session.utm_campaign, "spring_launch");
      assert.equal(session.gclid, "gclid-1");
      assert.equal(session.channel, "paid_search");
      assert.equal(session.source_category, "search");
      assert.equal(websiteRow.installed_plugin_version, "1.0.0");
      assert.ok(websiteRow.last_seen_at);
    }
  },
  {
    name: "tracking ingestion respects consent mode for denied analytics events",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Client A",
        website_name: "Client A Site",
        base_url: "https://example.com",
        config_json: {
          respect_consent_mode: true
        }
      });
      const website = context.websiteRepository.findById(registration.website.id);
      const summary = context.trackingIngestionService.ingestBatch({
        website
      }, {
        installation_id: "install-1",
        plugin_version: "1.0.0",
        sent_at: "2026-03-16T12:00:00.000Z",
        events: [
          {
            event_uuid: "event-denied",
            event_type: "page_view",
            event_name: null,
            occurred_at: "2026-03-16T12:00:00.000Z",
            visitor_id: "visitor-1",
            session_id: "session-1",
            page_url: "https://example.com/landing",
            page_path: "/landing",
            referrer_url: null,
            utm: {},
            click_ids: {},
            consent: {
              analytics_storage: "denied"
            },
            meta: {}
          },
          {
            event_uuid: "event-consent",
            event_type: "consent_update",
            event_name: null,
            occurred_at: "2026-03-16T12:01:00.000Z",
            visitor_id: "visitor-1",
            session_id: "session-1",
            page_url: null,
            page_path: null,
            referrer_url: null,
            utm: {},
            click_ids: {},
            consent: {
              analytics_storage: "denied"
            },
            meta: {}
          }
        ]
      });
      const session = context.database.prepare(`
        SELECT consent_state_json
        FROM sessions
        WHERE session_uuid = 'session-1'
      `).get();

      assert.equal(summary.received, 2);
      assert.equal(summary.inserted, 1);
      assert.equal(summary.skipped_due_to_consent, 1);
      assert.equal(context.database.prepare("SELECT COUNT(*) AS count FROM tracking_events").get().count, 1);
      assert.equal(context.database.prepare("SELECT COUNT(*) AS count FROM sessions").get().count, 1);
      assert.equal(JSON.parse(session.consent_state_json).analytics_storage, "denied");
    }
  },
  {
    name: "tracking ingestion ignores duplicate event uuids cleanly",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Client A",
        website_name: "Client A Site",
        base_url: "https://example.com"
      });
      const website = context.websiteRepository.findById(registration.website.id);
      const payload = {
        installation_id: "install-1",
        plugin_version: "1.0.0",
        sent_at: "2026-03-16T12:00:00.000Z",
        events: [{
          event_uuid: "event-duplicate",
          event_type: "page_view",
          event_name: null,
          occurred_at: "2026-03-16T12:00:00.000Z",
          visitor_id: "visitor-1",
          session_id: "session-1",
          page_url: "https://example.com/landing",
          page_path: "/landing",
          referrer_url: null,
          utm: {},
          click_ids: {},
          meta: {}
        }]
      };

      const first = context.trackingIngestionService.ingestBatch({ website }, payload);
      const second = context.trackingIngestionService.ingestBatch({ website }, payload);
      const session = context.database.prepare(`
        SELECT pageviews
        FROM sessions
        WHERE session_uuid = 'session-1'
      `).get();

      assert.equal(first.inserted, 1);
      assert.equal(first.duplicates, 0);
      assert.equal(second.inserted, 0);
      assert.equal(second.duplicates, 1);
      assert.equal(context.database.prepare("SELECT COUNT(*) AS count FROM tracking_events").get().count, 1);
      assert.equal(session.pageviews, 1);
    }
  },
  {
    name: "analytics reporting builds attribution models and rollups",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Client A",
        website_name: "Client A Site",
        base_url: "https://example.com"
      });
      const website = context.websiteRepository.findById(registration.website.id);

      context.trackingIngestionService.ingestBatch({ website }, {
        installation_id: "install-1",
        plugin_version: "1.0.0",
        sent_at: "2026-03-16T09:00:00.000Z",
        events: [{
          event_uuid: "event-first",
          event_type: "page_view",
          event_name: null,
          occurred_at: "2026-03-16T09:00:00.000Z",
          visitor_id: "visitor-1",
          session_id: "session-1",
          page_url: "https://example.com/landing",
          page_path: "/landing",
          referrer_url: "https://www.google.com/search?q=brand",
          utm: {
            source: "google",
            medium: "cpc",
            campaign: "spring_launch",
            term: null,
            content: null
          },
          click_ids: {},
          consent: {},
          meta: {
            channel: "paid_search",
            source_category: "search"
          }
        }]
      });
      context.trackingIngestionService.ingestBatch({ website }, {
        installation_id: "install-1",
        plugin_version: "1.0.0",
        sent_at: "2026-03-17T10:00:00.000Z",
        events: [
          {
            event_uuid: "event-second",
            event_type: "page_view",
            event_name: null,
            occurred_at: "2026-03-17T10:00:00.000Z",
            visitor_id: "visitor-1",
            session_id: "session-2",
            page_url: "https://example.com/pricing",
            page_path: "/pricing",
            referrer_url: "https://mail.example.com/click",
            utm: {
              source: "newsletter",
              medium: "email",
              campaign: "march_news",
              term: null,
              content: null
            },
            click_ids: {},
            consent: {},
            meta: {
              channel: "email",
              source_category: "owned"
            }
          },
          {
            event_uuid: "event-conversion",
            event_type: "conversion",
            event_name: "demo_request",
            occurred_at: "2026-03-17T10:05:00.000Z",
            visitor_id: "visitor-1",
            session_id: "session-2",
            page_url: "https://example.com/pricing",
            page_path: "/pricing",
            referrer_url: "https://mail.example.com/click",
            utm: {
              source: "newsletter",
              medium: "email",
              campaign: "march_news",
              term: null,
              content: null
            },
            click_ids: {},
            consent: {},
            meta: {
              channel: "email",
              source_category: "owned",
              value: 250
            }
          }
        ]
      });

      const firstTouch = context.analyticsReportingService.buildReport({
        websiteId: website.id,
        dateFrom: "2026-03-16",
        dateTo: "2026-03-17",
        model: "first_touch"
      });
      const lastTouch = context.analyticsReportingService.buildReport({
        websiteId: website.id,
        dateFrom: "2026-03-16",
        dateTo: "2026-03-17",
        model: "last_touch"
      });
      const attributionRows = context.conversionAttributionRepository.listByWebsiteId(website.id, "last_touch");

      assert.equal(firstTouch.summary.attributed_conversions, 1);
      assert.equal(lastTouch.summary.attributed_conversions, 1);
      assert.equal(firstTouch.breakdowns.sources[0].label, "google");
      assert.equal(lastTouch.breakdowns.sources[0].label, "newsletter");
      assert.equal(lastTouch.breakdowns.channels[0].label, "email");
      assert.equal(lastTouch.summary.attributed_conversion_value, 250);
      assert.equal(lastTouch.traffic.breakdowns.sources[0].label, "newsletter");
      assert.equal(lastTouch.traffic.breakdowns.channels[0].label, "email");
      assert.equal(lastTouch.traffic.breakdowns.campaigns[0].label, "march_news");
      assert.equal(lastTouch.traffic.breakdowns.landing_pages[0].label, "/pricing");
      assert.equal(lastTouch.traffic.breakdowns.event_types[0].label, "page_view");
      assert.equal(attributionRows.length, 1);
      assert.equal(attributionRows[0].utm_source, "newsletter");
      assert.equal(context.database.prepare("SELECT COUNT(*) AS count FROM analytics_daily_traffic_rollups").get().count >= 2, true);
      assert.equal(context.database.prepare("SELECT COUNT(*) AS count FROM analytics_daily_dimension_rollups").get().count >= 8, true);
      assert.equal(context.database.prepare("SELECT COUNT(*) AS count FROM analytics_daily_conversion_rollups").get().count >= 3, true);
    }
  },
  {
    name: "analytics reporting exposes traffic breakdowns without conversions",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Client Traffic",
        website_name: "Traffic Site",
        base_url: "https://traffic.example.com"
      });
      const website = context.websiteRepository.findById(registration.website.id);

      context.trackingIngestionService.ingestBatch({ website }, {
        installation_id: "install-traffic",
        plugin_version: "1.0.0",
        sent_at: "2026-03-16T11:00:00.000Z",
        events: [
          {
            event_uuid: "event-traffic-1",
            event_type: "page_view",
            event_name: null,
            occurred_at: "2026-03-16T11:00:00.000Z",
            visitor_id: "visitor-traffic",
            session_id: "session-traffic",
            page_url: "https://traffic.example.com/pricing",
            page_path: "/pricing",
            referrer_url: "https://www.facebook.com/",
            utm: {
              source: "facebook",
              medium: "social",
              campaign: "spring_social",
              term: null,
              content: null
            },
            click_ids: {},
            consent: {},
            meta: {
              device_type: "mobile",
              browser_name: "chrome"
            }
          },
          {
            event_uuid: "event-traffic-2",
            event_type: "click",
            event_name: "outbound_click",
            occurred_at: "2026-03-16T11:00:10.000Z",
            visitor_id: "visitor-traffic",
            session_id: "session-traffic",
            page_url: "https://traffic.example.com/pricing",
            page_path: "/pricing",
            referrer_url: "https://www.facebook.com/",
            utm: {
              source: "facebook",
              medium: "social",
              campaign: "spring_social",
              term: null,
              content: null
            },
            click_ids: {},
            consent: {},
            meta: {
              link_url: "https://partner.example.com",
              device_type: "mobile",
              browser_name: "chrome"
            }
          }
        ]
      });

      const report = context.analyticsReportingService.buildReport({
        websiteId: website.id,
        dateFrom: "2026-03-16",
        dateTo: "2026-03-16",
        model: "last_touch"
      });

      assert.equal(report.summary.sessions, 1);
      assert.equal(report.summary.events, 2);
      assert.equal(report.summary.raw_conversions, 0);
      assert.equal(report.summary.attributed_conversions, 0);
      assert.equal(report.summary.engaged_sessions, 1);
      assert.equal(report.summary.engagement_rate, 100);
      assert.equal(report.summary.visitors, 1);
      assert.equal(report.traffic.breakdowns.channels[0].label, "social");
      assert.equal(report.traffic.breakdowns.sources[0].label, "facebook");
      assert.equal(report.traffic.breakdowns.mediums[0].label, "social");
      assert.equal(report.traffic.breakdowns.campaigns[0].label, "spring_social");
      assert.equal(report.traffic.breakdowns.landing_pages[0].label, "/pricing");
      assert.equal(report.traffic.breakdowns.referrer_domains[0].label, "www.facebook.com");
      assert.equal(report.traffic.breakdowns.devices[0].label, "mobile");
      assert.equal(report.traffic.breakdowns.browsers[0].label, "chrome");
      assert.equal(report.traffic.breakdowns.event_types[0].label, "click");
      assert.equal(report.traffic.breakdowns.event_types.some((row) => row.label === "page_view"), true);
      assert.equal(report.funnel.steps[0].count, 1);
      assert.equal(report.funnel.steps[1].count, 1);
      assert.equal(report.attribution.breakdowns.sources.length, 0);
    }
  },
  {
    name: "tracking ingestion persists session device and browser snapshots for traffic rollups",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Client Snapshot",
        website_name: "Snapshot Site",
        base_url: "https://snapshot.example.com"
      });
      const website = context.websiteRepository.findById(registration.website.id);

      context.trackingIngestionService.ingestBatch({ website }, {
        installation_id: "install-snapshot",
        plugin_version: "1.0.0",
        sent_at: "2026-03-16T15:00:00.000Z",
        events: [{
          event_uuid: "event-snapshot-1",
          event_type: "page_view",
          event_name: null,
          occurred_at: "2026-03-16T15:00:00.000Z",
          visitor_id: "visitor-snapshot",
          session_id: "session-snapshot",
          page_url: "https://snapshot.example.com/home",
          page_path: "/home",
          referrer_url: null,
          utm: {
            source: null,
            medium: null,
            campaign: null,
            term: null,
            content: null
          },
          click_ids: {},
          consent: {},
          meta: {
            device_type: "tablet",
            browser_name: "safari"
          }
        }]
      });

      const session = context.database.prepare(`
        SELECT device_type, browser_name
        FROM sessions
        WHERE website_id = :website_id
      `).get({
        website_id: website.id
      });
      assert.equal(session.device_type, "tablet");
      assert.equal(session.browser_name, "safari");

      context.database.prepare(`
        UPDATE tracking_events
        SET meta_json = '{}'
        WHERE website_id = :website_id
      `).run({
        website_id: website.id
      });

      context.analyticsReportingService.refreshWebsite(website.id, {
        dateFrom: "2026-03-16",
        dateTo: "2026-03-16"
      });

      const report = context.analyticsReportingService.buildReport({
        websiteId: website.id,
        dateFrom: "2026-03-16",
        dateTo: "2026-03-16",
        model: "last_touch"
      });

      assert.equal(report.traffic.breakdowns.devices[0].label, "tablet");
      assert.equal(report.traffic.breakdowns.browsers[0].label, "safari");
    }
  },
  {
    name: "analytics reporting stitches visitors across websites for the same client",
    run() {
      const context = createTrackingTestContext();
      const first = context.websiteProvisioningService.createWebsite({
        client_name: "Client Identity",
        website_name: "Site Alpha",
        base_url: "https://alpha.example.com"
      });
      const second = context.websiteProvisioningService.createWebsite({
        client_name: "Client Identity",
        website_name: "Site Beta",
        base_url: "https://beta.example.com"
      });
      const firstWebsite = context.websiteRepository.findById(first.website.id);
      const secondWebsite = context.websiteRepository.findById(second.website.id);

      context.trackingIngestionService.ingestBatch({ website: firstWebsite }, {
        installation_id: "identity-1",
        plugin_version: "1.0.0",
        sent_at: "2026-03-16T16:00:00.000Z",
        events: [{
          event_uuid: "event-identity-1",
          event_type: "page_view",
          event_name: null,
          occurred_at: "2026-03-16T16:00:00.000Z",
          visitor_id: "visitor-alpha",
          session_id: "session-alpha",
          page_url: "https://alpha.example.com/contact",
          page_path: "/contact",
          referrer_url: null,
          utm: {
            source: "google",
            medium: "cpc",
            campaign: "identity",
            term: null,
            content: null
          },
          click_ids: {},
          consent: {},
          meta: {
            lead_email_hash: "email-hash-1"
          }
        }]
      });
      context.trackingIngestionService.ingestBatch({ website: secondWebsite }, {
        installation_id: "identity-2",
        plugin_version: "1.0.0",
        sent_at: "2026-03-16T16:05:00.000Z",
        events: [{
          event_uuid: "event-identity-2",
          event_type: "page_view",
          event_name: null,
          occurred_at: "2026-03-16T16:05:00.000Z",
          visitor_id: "visitor-beta",
          session_id: "session-beta",
          page_url: "https://beta.example.com/contact",
          page_path: "/contact",
          referrer_url: null,
          utm: {
            source: "newsletter",
            medium: "email",
            campaign: "identity",
            term: null,
            content: null
          },
          click_ids: {},
          consent: {},
          meta: {
            lead_email_hash: "email-hash-1"
          }
        }]
      });

      const visitorProfiles = context.database.prepare(`
        SELECT stitched_profile_id
        FROM visitors
        WHERE website_id IN (:first_website_id, :second_website_id)
        ORDER BY website_id ASC
      `).all({
        first_website_id: firstWebsite.id,
        second_website_id: secondWebsite.id
      });
      assert.equal(visitorProfiles.length, 2);
      assert.equal(visitorProfiles[0].stitched_profile_id, visitorProfiles[1].stitched_profile_id);
      assert.equal(context.database.prepare("SELECT COUNT(*) AS count FROM stitched_profiles").get().count, 1);

      const client = context.clientRepository.findByName("Client Identity");
      const report = context.analyticsReportingService.buildReport({
        clientId: client.id,
        dateFrom: "2026-03-16",
        dateTo: "2026-03-16",
        model: "last_touch"
      });

      assert.equal(report.summary.sessions, 2);
      assert.equal(report.summary.visitors, 1);
    }
  },
  {
    name: "analytics reporting aggregates traffic by client",
    run() {
      const context = createTrackingTestContext();
      const firstRegistration = context.websiteProvisioningService.createWebsite({
        client_name: "Client Shared",
        website_name: "Site One",
        base_url: "https://one.example.com"
      });
      const secondRegistration = context.websiteProvisioningService.createWebsite({
        client_name: "Client Shared",
        website_name: "Site Two",
        base_url: "https://two.example.com"
      });
      const thirdRegistration = context.websiteProvisioningService.createWebsite({
        client_name: "Other Client",
        website_name: "Site Three",
        base_url: "https://three.example.com"
      });
      const firstWebsite = context.websiteRepository.findById(firstRegistration.website.id);
      const secondWebsite = context.websiteRepository.findById(secondRegistration.website.id);
      const thirdWebsite = context.websiteRepository.findById(thirdRegistration.website.id);

      context.trackingIngestionService.ingestBatch({ website: firstWebsite }, {
        installation_id: "install-1",
        plugin_version: "1.0.0",
        sent_at: "2026-03-16T12:00:00.000Z",
        events: [{
          event_uuid: "event-client-1",
          event_type: "page_view",
          event_name: null,
          occurred_at: "2026-03-16T12:00:00.000Z",
          visitor_id: "visitor-1",
          session_id: "session-1",
          page_url: "https://one.example.com/landing-a",
          page_path: "/landing-a",
          referrer_url: null,
          utm: {
            source: "google",
            medium: "cpc",
            campaign: "brand_a",
            term: null,
            content: null
          },
          click_ids: {},
          consent: {},
          meta: {}
        }]
      });
      context.trackingIngestionService.ingestBatch({ website: secondWebsite }, {
        installation_id: "install-2",
        plugin_version: "1.0.0",
        sent_at: "2026-03-16T12:05:00.000Z",
        events: [{
          event_uuid: "event-client-2",
          event_type: "page_view",
          event_name: null,
          occurred_at: "2026-03-16T12:05:00.000Z",
          visitor_id: "visitor-2",
          session_id: "session-2",
          page_url: "https://two.example.com/landing-b",
          page_path: "/landing-b",
          referrer_url: null,
          utm: {
            source: "newsletter",
            medium: "email",
            campaign: "brand_b",
            term: null,
            content: null
          },
          click_ids: {},
          consent: {},
          meta: {}
        }]
      });
      context.trackingIngestionService.ingestBatch({ website: thirdWebsite }, {
        installation_id: "install-3",
        plugin_version: "1.0.0",
        sent_at: "2026-03-16T12:10:00.000Z",
        events: [{
          event_uuid: "event-client-3",
          event_type: "page_view",
          event_name: null,
          occurred_at: "2026-03-16T12:10:00.000Z",
          visitor_id: "visitor-3",
          session_id: "session-3",
          page_url: "https://three.example.com/landing-c",
          page_path: "/landing-c",
          referrer_url: null,
          utm: {
            source: "linkedin",
            medium: "social",
            campaign: "brand_c",
            term: null,
            content: null
          },
          click_ids: {},
          consent: {},
          meta: {}
        }]
      });

      const sharedClient = context.clientRepository.findByName("Client Shared");
      const report = context.analyticsReportingService.buildReport({
        clientId: sharedClient.id,
        dateFrom: "2026-03-16",
        dateTo: "2026-03-16",
        model: "last_touch"
      });

      assert.equal(report.filters.client_id, sharedClient.id);
      assert.equal(report.filters.website_id, null);
      assert.equal(report.scope.type, "client");
      assert.equal(report.scope.website_count, 2);
      assert.equal(report.summary.sessions, 2);
      assert.equal(report.summary.pageviews, 2);
      assert.equal(report.websites.length, 2);
      assert.equal(report.traffic.breakdowns.sources.some((row) => row.label === "google"), true);
      assert.equal(report.traffic.breakdowns.sources.some((row) => row.label === "newsletter"), true);
      assert.equal(report.traffic.breakdowns.sources.some((row) => row.label === "linkedin"), false);
    }
  },
  {
    name: "analytics reporting supports bounded website refreshes",
    run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Client Bound",
        website_name: "Site Bound",
        base_url: "https://bound.example.com"
      });
      const website = context.websiteRepository.findById(registration.website.id);

      context.trackingIngestionService.ingestBatch({ website }, {
        installation_id: "install-bound",
        plugin_version: "1.0.0",
        sent_at: "2026-03-16T09:00:00.000Z",
        events: [{
          event_uuid: "event-bound-1",
          event_type: "page_view",
          event_name: null,
          occurred_at: "2026-03-16T09:00:00.000Z",
          visitor_id: "visitor-bound",
          session_id: "session-bound-1",
          page_url: "https://bound.example.com/day-one",
          page_path: "/day-one",
          referrer_url: null,
          utm: {
            source: "google",
            medium: "cpc",
            campaign: "day_one",
            term: null,
            content: null
          },
          click_ids: {},
          consent: {},
          meta: {}
        }]
      });
      context.trackingIngestionService.ingestBatch({ website }, {
        installation_id: "install-bound",
        plugin_version: "1.0.0",
        sent_at: "2026-03-17T09:00:00.000Z",
        events: [{
          event_uuid: "event-bound-2",
          event_type: "page_view",
          event_name: null,
          occurred_at: "2026-03-17T09:00:00.000Z",
          visitor_id: "visitor-bound",
          session_id: "session-bound-2",
          page_url: "https://bound.example.com/day-two",
          page_path: "/day-two",
          referrer_url: null,
          utm: {
            source: "newsletter",
            medium: "email",
            campaign: "day_two",
            term: null,
            content: null
          },
          click_ids: {},
          consent: {},
          meta: {}
        }]
      });

      context.analyticsReportingService.refreshWebsite(website.id, {
        dateFrom: "2026-03-17",
        dateTo: "2026-03-17"
      });

      const dayOne = context.database.prepare(`
        SELECT sessions, pageviews
        FROM analytics_daily_traffic_rollups
        WHERE website_id = :website_id
          AND rollup_date = '2026-03-16'
      `).get({
        website_id: website.id
      });
      const dayTwo = context.database.prepare(`
        SELECT sessions, pageviews
        FROM analytics_daily_traffic_rollups
        WHERE website_id = :website_id
          AND rollup_date = '2026-03-17'
      `).get({
        website_id: website.id
      });

      assert.equal(dayOne.sessions, 1);
      assert.equal(dayOne.pageviews, 1);
      assert.equal(dayTwo.sessions, 1);
      assert.equal(dayTwo.pageviews, 1);
      assert.equal(context.database.prepare("SELECT COUNT(*) AS count FROM analytics_daily_traffic_rollups WHERE website_id = :website_id").get({ website_id: website.id }).count, 2);
    }
  },
  {
    name: "analytics refresh service rebuilds queued website ranges",
    async run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Client Refresh",
        website_name: "Refresh Site",
        base_url: "https://refresh.example.com"
      });
      const website = context.websiteRepository.findById(registration.website.id);

      context.trackingIngestionService.ingestBatch({ website }, {
        installation_id: "install-refresh",
        plugin_version: "1.0.0",
        sent_at: "2026-03-18T09:00:00.000Z",
        events: [{
          event_uuid: "event-refresh-1",
          event_type: "page_view",
          event_name: null,
          occurred_at: "2026-03-18T09:00:00.000Z",
          visitor_id: "visitor-refresh",
          session_id: "session-refresh",
          page_url: "https://refresh.example.com/landing",
          page_path: "/landing",
          referrer_url: "https://google.com",
          utm: {
            source: "google",
            medium: "cpc",
            campaign: "refresh_campaign",
            term: null,
            content: null
          },
          click_ids: {},
          consent: {},
          meta: {}
        }]
      });

      context.database.prepare("DELETE FROM analytics_daily_traffic_rollups WHERE website_id = :website_id").run({
        website_id: website.id
      });
      context.database.prepare("DELETE FROM analytics_daily_dimension_rollups WHERE website_id = :website_id").run({
        website_id: website.id
      });

      const queued = context.analyticsRefreshService.enqueueWebsiteRefresh(website.id, {
        dateFrom: "2026-03-18",
        dateTo: "2026-03-18",
        reason: "test_refresh"
      });
      await context.analyticsRefreshService.processPending();

      const trafficRow = context.database.prepare(`
        SELECT sessions, pageviews
        FROM analytics_daily_traffic_rollups
        WHERE website_id = :website_id
          AND rollup_date = '2026-03-18'
      `).get({
        website_id: website.id
      });
      const latestJob = context.analyticsRefreshJobRepository.latestForWebsiteIds([website.id])[0];

      assert.equal(queued.queued, 1);
      assert.equal(trafficRow.sessions, 1);
      assert.equal(trafficRow.pageviews, 1);
      assert.equal(latestJob.status, "completed");
    }
  },
  {
    name: "plugin config endpoint returns default tracking config",
    async run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Client A",
        website_name: "Client A Site",
        base_url: "https://example.com"
      });
      const controller = new TrackingController({
        trackingAuthService: context.trackingAuthService,
        trackingIngestionService: context.trackingIngestionService,
        pluginConfigService: new PluginConfigService(),
        websiteRepository: context.websiteRepository,
        pluginTelemetryService: context.pluginTelemetryService
      });
      const timestamp = new Date().toISOString();
      const request = createSignedTrackingRequest({
        authService: context.trackingAuthService,
        method: "GET",
        path: "/api/v1/plugin/config",
        publicKey: registration.public_key,
        secretKey: registration.secret_key,
        timestamp,
        body: null
      });

      const response = await controller.handleConfig(request);
      const body = JSON.parse(response.body);

      assert.equal(response.statusCode, 200);
      assert.equal(body.website_id, registration.website.id);
      assert.equal(body.website_name, "Client A Site");
      assert.equal(body.config_version, 1);
      assert.equal(body.session_timeout_minutes, 30);
      assert.equal(body.cookie_retention_days, 90);
      assert.equal(body.track_scroll, true);
      assert.equal(body.track_outbound_clicks, true);
      assert.equal(body.track_phone_clicks, true);
      assert.equal(body.track_file_downloads, true);
      assert.equal(body.respect_consent_mode, false);
      assert.deepEqual(body.excluded_roles, []);
    }
  },
  {
    name: "reporting controller returns report json for a selected website",
    async run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Client A",
        website_name: "Client A Site",
        base_url: "https://example.com"
      });
      const website = context.websiteRepository.findById(registration.website.id);

      context.trackingIngestionService.ingestBatch({ website }, {
        installation_id: "install-1",
        plugin_version: "1.0.0",
        sent_at: "2026-03-17T10:00:00.000Z",
        events: [{
          event_uuid: "event-report",
          event_type: "conversion",
          event_name: "lead",
          occurred_at: "2026-03-17T10:00:00.000Z",
          visitor_id: "visitor-1",
          session_id: "session-1",
          page_url: "https://example.com/contact",
          page_path: "/contact",
          referrer_url: null,
          utm: {
            source: "direct",
            medium: "none",
            campaign: "brand",
            term: null,
            content: null
          },
          click_ids: {},
          consent: {},
          meta: {
            channel: "website",
            source_category: "direct",
            value: 100
          }
        }]
      });

      const controller = new ReportingController({
        analyticsReportingService: context.analyticsReportingService
      });
      const response = await controller.handleJson({
        query: {
          website_id: String(website.id),
          date_from: "2026-03-17",
          date_to: "2026-03-17",
          model: "last_touch"
        }
      });
      const body = JSON.parse(response.body);

      assert.equal(response.statusCode, 200);
      assert.equal(body.filters.website_id, website.id);
      assert.equal(body.filters.client_id, registration.website.client_id);
      assert.equal(body.refresh.mode, "inline");
      assert.equal(body.summary.attributed_conversions, 1);
      assert.equal(body.traffic.breakdowns.sources[0].label, "direct");
      assert.equal(body.attribution.breakdowns.sources[0].label, "direct");
      assert.equal(body.recent_conversions.length, 1);
    }
  },
  {
    name: "reporting controller exposes traffic and funnel json endpoints",
    async run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Client Funnel",
        website_name: "Funnel Site",
        base_url: "https://funnel.example.com"
      });
      const website = context.websiteRepository.findById(registration.website.id);

      context.trackingIngestionService.ingestBatch({ website }, {
        installation_id: "install-funnel",
        plugin_version: "1.0.0",
        sent_at: "2026-03-18T12:00:00.000Z",
        events: [
          {
            event_uuid: "event-funnel-1",
            event_type: "page_view",
            event_name: null,
            occurred_at: "2026-03-18T12:00:00.000Z",
            visitor_id: "visitor-funnel",
            session_id: "session-funnel",
            page_url: "https://funnel.example.com/landing",
            page_path: "/landing",
            referrer_url: "https://www.linkedin.com/",
            utm: {
              source: "linkedin",
              medium: "social",
              campaign: "funnel_campaign",
              term: null,
              content: null
            },
            click_ids: {},
            consent: {},
            meta: {
              device_type: "desktop",
              browser_name: "firefox"
            }
          },
          {
            event_uuid: "event-funnel-2",
            event_type: "form_submit",
            event_name: "lead_form",
            occurred_at: "2026-03-18T12:05:00.000Z",
            visitor_id: "visitor-funnel",
            session_id: "session-funnel",
            page_url: "https://funnel.example.com/landing",
            page_path: "/landing",
            referrer_url: "https://www.linkedin.com/",
            utm: {
              source: "linkedin",
              medium: "social",
              campaign: "funnel_campaign",
              term: null,
              content: null
            },
            click_ids: {},
            consent: {},
            meta: {
              form_provider: "generic"
            }
          }
        ]
      });

      const controller = new ReportingController({
        analyticsReportingService: context.analyticsReportingService
      });
      const trafficResponse = await controller.handleTrafficJson({
        query: {
          website_id: String(website.id),
          date_from: "2026-03-18",
          date_to: "2026-03-18",
          model: "last_touch"
        }
      });
      const funnelResponse = await controller.handleFunnelJson({
        query: {
          website_id: String(website.id),
          date_from: "2026-03-18",
          date_to: "2026-03-18",
          model: "last_touch"
        }
      });
      const trafficBody = JSON.parse(trafficResponse.body);
      const funnelBody = JSON.parse(funnelResponse.body);

      assert.equal(trafficResponse.statusCode, 200);
      assert.equal(funnelResponse.statusCode, 200);
      assert.equal(trafficBody.breakdowns.mediums[0].label, "social");
      assert.equal(trafficBody.breakdowns.referrer_domains[0].label, "www.linkedin.com");
      assert.equal(trafficBody.breakdowns.devices[0].label, "desktop");
      assert.equal(trafficBody.breakdowns.browsers[0].label, "firefox");
      assert.equal(funnelBody.funnel.steps[2].count, 1);
      assert.equal(funnelBody.funnel.totals.raw_conversions, 1);
    }
  },
  {
    name: "reporting controller honors configurable funnel selection",
    async run() {
      const context = createTrackingTestContext();
      const registration = context.websiteProvisioningService.createWebsite({
        client_name: "Client Custom Funnel",
        website_name: "Custom Funnel Site",
        base_url: "https://custom-funnel.example.com",
        config_json: {
          reporting_funnels: [{
            key: "booking_flow",
            label: "Booking Flow",
            steps: [
              {
                key: "sessions",
                label: "Sessions",
                type: "session"
              },
              {
                key: "pricing_views",
                label: "Pricing Views",
                type: "page",
                page_path: "/pricing"
              },
              {
                key: "schedule_clicks",
                label: "Schedule Clicks",
                type: "event",
                event_type: "click",
                event_name: "schedule_click"
              },
              {
                key: "lead_forms",
                label: "Lead Forms",
                type: "conversion",
                conversion_type: "form_submit"
              }
            ]
          }]
        }
      });
      const website = context.websiteRepository.findById(registration.website.id);

      context.trackingIngestionService.ingestBatch({ website }, {
        installation_id: "install-custom-funnel",
        plugin_version: "1.0.0",
        sent_at: "2026-03-19T12:00:00.000Z",
        events: [
          {
            event_uuid: "custom-funnel-1",
            event_type: "page_view",
            event_name: null,
            occurred_at: "2026-03-19T12:00:00.000Z",
            visitor_id: "visitor-custom-funnel",
            session_id: "session-custom-funnel",
            page_url: "https://custom-funnel.example.com/pricing",
            page_path: "/pricing",
            referrer_url: null,
            utm: {
              source: "google",
              medium: "cpc",
              campaign: "booking_flow",
              term: null,
              content: null
            },
            click_ids: {},
            consent: {},
            meta: {}
          },
          {
            event_uuid: "custom-funnel-2",
            event_type: "click",
            event_name: "schedule_click",
            occurred_at: "2026-03-19T12:01:00.000Z",
            visitor_id: "visitor-custom-funnel",
            session_id: "session-custom-funnel",
            page_url: "https://custom-funnel.example.com/pricing",
            page_path: "/pricing",
            referrer_url: null,
            utm: {
              source: "google",
              medium: "cpc",
              campaign: "booking_flow",
              term: null,
              content: null
            },
            click_ids: {},
            consent: {},
            meta: {
              link_url: "https://custom-funnel.example.com/book"
            }
          },
          {
            event_uuid: "custom-funnel-3",
            event_type: "form_submit",
            event_name: "booking_form",
            occurred_at: "2026-03-19T12:02:00.000Z",
            visitor_id: "visitor-custom-funnel",
            session_id: "session-custom-funnel",
            page_url: "https://custom-funnel.example.com/book",
            page_path: "/book",
            referrer_url: null,
            utm: {
              source: "google",
              medium: "cpc",
              campaign: "booking_flow",
              term: null,
              content: null
            },
            click_ids: {},
            consent: {},
            meta: {
              form_provider: "generic"
            }
          }
        ]
      });

      const controller = new ReportingController({
        analyticsReportingService: context.analyticsReportingService
      });
      const response = await controller.handleFunnelJson({
        query: {
          website_id: String(website.id),
          date_from: "2026-03-19",
          date_to: "2026-03-19",
          model: "last_touch",
          funnel_key: "booking_flow"
        }
      });
      const body = JSON.parse(response.body);

      assert.equal(response.statusCode, 200);
      assert.equal(body.filters.funnel_key, "booking_flow");
      assert.equal(body.funnels.selected_key, "booking_flow");
      assert.equal(body.funnel.label, "Booking Flow");
      assert.equal(body.funnel.steps[0].count, 1);
      assert.equal(body.funnel.steps[1].count, 1);
      assert.equal(body.funnel.steps[2].count, 1);
      assert.equal(body.funnel.steps[3].count, 1);
    }
  }
];

function buildTrackerHeaderRow() {
  return [
    "Date",
    "Destination URL",
    "Source",
    "Medium",
    "Campaign Name/Promotion or Campaign",
    "Campaign Term / Keywords / Running Shoes",
    "Campaign Content / A/B Test / To same URL",
    "UTM String",
    "Bit.ly",
    "Client Code"
  ];
}

function createTrackingTestContext() {
  const database = new DatabaseSync(":memory:");
  applyTrackingMigrations(database);
  const clientRepository = new ClientRepository(database);
  const websiteRepository = new WebsiteRepository(database);
  const visitorRepository = new VisitorRepository(database);
  const sessionRepository = new SessionRepository(database);
  const trackingEventRepository = new TrackingEventRepository(database);
  const conversionRepository = new ConversionRepository(database);
  const stitchedProfileRepository = new StitchedProfileRepository(database);
  const websiteObservabilityEventRepository = new WebsiteObservabilityEventRepository(database);
  const websiteInstallationRepository = new WebsiteInstallationRepository(database);
  const websiteInstallationEventRepository = new WebsiteInstallationEventRepository(database);
  const websiteCredentialEventRepository = new WebsiteCredentialEventRepository(database);
  const conversionAttributionRepository = new ConversionAttributionRepository(database);
  const analyticsRefreshJobRepository = new AnalyticsRefreshJobRepository(database);
  const analyticsRollupRepository = new AnalyticsRollupRepository(database);
  const trackingAuthService = new TrackingAuthService({
    websiteRepository,
    websiteObservabilityEventRepository,
    encryptionKey: "test-tracking-encryption-key",
    maxAgeSeconds: 300,
    logger: nullLogger
  });
  const websiteProvisioningService = new WebsiteProvisioningService({
    clientRepository,
    websiteRepository,
    trackingAuthService
  });
  const pluginTelemetryService = new PluginTelemetryService({
    websiteRepository,
    websiteInstallationRepository,
    websiteInstallationEventRepository
  });
  const websiteHealthService = new WebsiteHealthService();
  const identityStitchingService = new IdentityStitchingService({
    visitorRepository,
    stitchedProfileRepository
  });
  const analyticsReportingService = new AnalyticsReportingService({
    database,
    clientRepository,
    websiteRepository,
    conversionAttributionRepository,
    analyticsRollupRepository
  });
  const analyticsRefreshService = new AnalyticsRefreshService({
    websiteRepository,
    analyticsReportingService,
    analyticsRefreshJobRepository,
    logger: nullLogger,
    enabled: true,
    intervalMs: 1000,
    batchSize: 4,
    retryDelayMs: 1000
  });
  const websiteAdministrationService = new WebsiteAdministrationService({
    clientRepository,
    websiteRepository,
    websiteProvisioningService,
    conversionRepository,
    websiteInstallationRepository,
    websiteInstallationEventRepository,
    websiteCredentialEventRepository,
    websiteObservabilityEventRepository,
    websiteHealthService,
    trackingAuthService
  });
  const trackingIngestionService = new TrackingIngestionService({
    database,
    websiteRepository,
    visitorRepository,
    sessionRepository,
    trackingEventRepository,
    conversionRepository,
    pluginTelemetryService,
    identityStitchingService,
    analyticsReportingService,
    logger: nullLogger
  });

  return {
    database,
    clientRepository,
    websiteRepository,
    visitorRepository,
    sessionRepository,
    trackingEventRepository,
    conversionRepository,
    stitchedProfileRepository,
    websiteObservabilityEventRepository,
    websiteInstallationRepository,
    websiteInstallationEventRepository,
    websiteCredentialEventRepository,
    conversionAttributionRepository,
    analyticsRefreshJobRepository,
    analyticsRollupRepository,
    trackingAuthService,
    websiteProvisioningService,
    pluginTelemetryService,
    websiteHealthService,
    identityStitchingService,
    analyticsReportingService,
    analyticsRefreshService,
    websiteAdministrationService,
    trackingIngestionService
  };
}

function applyTrackingMigrations(database) {
  const migrationDirectory = new URL("../database/migrations/", import.meta.url);
  const files = fs.readdirSync(migrationDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  files.forEach((file) => {
    database.exec(fs.readFileSync(new URL(`../database/migrations/${file}`, import.meta.url), "utf8"));
  });
}

function createSignedTrackingRequest({
  authService,
  publicKey,
  secretKey,
  method = "POST",
  path = "/api/v1/tracking/events/batch",
  timestamp,
  body
}) {
  const rawBody = body === null || body === undefined
    ? ""
    : JSON.stringify(body);
  const signature = authService.sign(secretKey, timestamp, rawBody);

  return createMockRequest({
    method,
    path,
    rawBody,
    headers: {
      "x-jf-public-key": publicKey,
      "x-jf-timestamp": timestamp,
      "x-jf-signature": signature
    }
  });
}

function createMockRequest({
  method = "POST",
  path = "/",
  rawBody = "",
  headers = {}
}) {
  const normalizedHeaders = {};
  Object.entries(headers).forEach(([key, value]) => {
    normalizedHeaders[String(key).toLowerCase()] = value;
  });

  return {
    method,
    path,
    headers: normalizedHeaders,
    rawBody,
    query: {},
    header(name, defaultValue = null) {
      return this.headers[String(name).toLowerCase()] ?? defaultValue;
    },
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
  };
}

function buildWorkbookFixtureBase64({ sheets }) {
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}
  </sheets>
</workbook>`;
  const relationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}
</Relationships>`;
  const entries = [
    { name: "xl/workbook.xml", content: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", content: relationshipsXml },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: buildWorksheetXml(sheet.rows)
    }))
  ];

  return createStoredZip(entries).toString("base64");
}

function buildWorksheetXml(rows) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${rows.map((cells, rowIndex) => `<row r="${rowIndex + 1}">${cells.map((value, columnIndex) => buildInlineStringCell(columnIndex + 1, rowIndex + 1, value)).join("")}</row>`).join("")}
  </sheetData>
</worksheet>`;
}

function buildInlineStringCell(columnNumber, rowNumber, value) {
  const reference = `${columnName(columnNumber)}${rowNumber}`;
  return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(String(value ?? ""))}</t></is></c>`;
}

function columnName(columnNumber) {
  let current = columnNumber;
  let result = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

function createStoredZip(entries) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  entries.forEach((entry) => {
    const fileName = Buffer.from(entry.name, "utf8");
    const content = Buffer.from(entry.content, "utf8");
    const crc = crc32(content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localChunks.push(localHeader, fileName, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralChunks.push(centralHeader, fileName);

    offset += localHeader.length + fileName.length + content.length;
  });

  const centralDirectory = Buffer.concat(centralChunks);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDirectory, endRecord]);
}

function crc32(buffer) {
  let value = 0xffffffff;

  for (const byte of buffer) {
    value ^= byte;
    for (let index = 0; index < 8; index += 1) {
      const mask = -(value & 1);
      value = (value >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (value ^ 0xffffffff) >>> 0;
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

let failures = 0;

for (const testCase of tests) {
  try {
    await testCase.run();
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
