import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import rules from "../config/rules.js";
import { HealthController } from "../src/controllers/health-controller.js";
import { UtmLibraryController } from "../src/controllers/utm-library-controller.js";
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
import { LinkGenerationService } from "../src/services/link-generation-service.js";
import { LinkWorkflowService } from "../src/services/link-workflow-service.js";
import { MessageFormatter } from "../src/services/message-formatter.js";
import { UtmLibraryEditorService } from "../src/services/utm-library-editor-service.js";
import { BasicAuthService } from "../src/services/basic-auth-service.js";
import { ClickUpWebhookController } from "../src/controllers/clickup-webhook-controller.js";
import { GeneratedLinkRepository } from "../src/repositories/generated-link-repository.js";
import { RequestRepository } from "../src/repositories/request-repository.js";

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
        "https://studleys.com/perennials?color=red&utm_campaign=SpringSale&utm_content=PlantFinder&utm_medium=Social&utm_source=Instagram&utm_term="
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
      assert.match(messages[0].message, /https:\/\/studleys\.com\/garden-plants\/\?utm_campaign=spring_sale/iu);
      assert.equal(updates.at(-1).fields.status, "completed_without_short_link");
      assert.equal(updates.at(-1).fields.error_code, "bitly_quota_reached");
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
        realm: "JF UTM Library"
      });

      const challenge = auth.protect({
        header() {
          return null;
        }
      });

      assert.ok(challenge);
      assert.equal(challenge.statusCode, 401);
      assert.match(challenge.headers["WWW-Authenticate"], /Basic realm="JF UTM Library"/iu);

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
          }
        },
        rulesService: {
          clients() {
            return ["studleys"];
          },
          channels() {
            return ["linkedin"];
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

      assert.equal(htmlResponse.statusCode, 200);
      assert.match(htmlResponse.headers["Content-Type"], /text\/html/iu);
      assert.match(htmlResponse.body, /UTM Library/iu);
      assert.match(htmlResponse.body, /spring_sale/iu);
      assert.match(htmlResponse.body, /QR Preview/iu);
      assert.match(htmlResponse.body, /create-qr-code/iu);
      assert.match(htmlResponse.body, /Edit and regenerate/iu);
      assert.match(htmlResponse.body, /Short Link/iu);
      assert.match(htmlResponse.body, /data-regenerate-form/iu);
      assert.equal(csvResponse.statusCode, 200);
      assert.match(csvResponse.headers["Content-Type"], /text\/csv/iu);
      assert.match(csvResponse.body, /request_id,status,client/i);
      assert.match(csvResponse.body, /Studleys/i);
      assert.equal(regenerateResponse.statusCode, 200);
      assert.match(regenerateResponse.body, /highlight_request_id=22/iu);
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
