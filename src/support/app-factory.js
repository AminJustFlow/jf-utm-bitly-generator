import fs from "node:fs";
import path from "node:path";
import baseConfig from "../../config/app.js";
import rules from "../../config/rules.js";
import { Router } from "../http/router.js";
import { Logger } from "./logger.js";
import { HttpClient } from "./http-client.js";
import { connectDatabase } from "./database.js";
import { MigrationRunner } from "./migration-runner.js";
import { Application } from "./application.js";
import { loadEnvFile } from "./env-loader.js";
import { HealthController } from "../controllers/health-controller.js";
import { DebugController } from "../controllers/debug-controller.js";
import { ClickUpWebhookController } from "../controllers/clickup-webhook-controller.js";
import { RequestRepository } from "../repositories/request-repository.js";
import { GeneratedLinkRepository } from "../repositories/generated-link-repository.js";
import { AuditLogRepository } from "../repositories/audit-log-repository.js";
import { RulesService } from "../services/rules-service.js";
import { UrlService } from "../services/url-service.js";
import { FingerprintService } from "../services/fingerprint-service.js";
import { FallbackCommandParser } from "../services/fallback-command-parser.js";
import { HeuristicParser } from "../services/heuristic-parser.js";
import { OpenAIParserService } from "../services/openai-parser-service.js";
import { LinkRequestParser } from "../services/link-request-parser.js";
import { RequestNormalizer } from "../services/request-normalizer.js";
import { ClickUpPayloadMapper } from "../services/clickup-payload-mapper.js";
import { WebhookVerifier } from "../services/webhook-verifier.js";
import { RateLimiter } from "../services/rate-limiter.js";
import { BitlyService } from "../services/bitly-service.js";
import { QrCodeService } from "../services/qr-code-service.js";
import { ClickUpChatService } from "../services/clickup-chat-service.js";
import { MessageFormatter } from "../services/message-formatter.js";
import { LinkWorkflowService } from "../services/link-workflow-service.js";

export async function createApplication(projectRoot) {
  loadEnvFile(path.join(projectRoot, ".env"));
  const config = resolveConfig(projectRoot);
  process.env.TZ = config.app.timezone;

  fs.mkdirSync(path.dirname(config.database.path), { recursive: true });
  fs.mkdirSync(path.dirname(config.logging.path), { recursive: true });

  const logger = new Logger(config.logging.path, config.app.debug);
  const httpClient = new HttpClient();
  const database = connectDatabase(config.database.path);
  const migrationRunner = new MigrationRunner(database, path.join(projectRoot, "database", "migrations"));
  await migrationRunner.migrate();

  const requestRepository = new RequestRepository(database);
  const generatedLinkRepository = new GeneratedLinkRepository(database);
  const auditLogRepository = new AuditLogRepository(database);
  const rulesService = new RulesService(rules);
  const urlService = new UrlService();
  const fingerprintService = new FingerprintService();
  const commandParser = new FallbackCommandParser();
  const heuristicParser = new HeuristicParser(rulesService);
  const openAIParser = new OpenAIParserService(httpClient, config.openai, rulesService);
  const linkRequestParser = new LinkRequestParser(commandParser, openAIParser, heuristicParser, logger);
  const requestNormalizer = new RequestNormalizer(rulesService, urlService, config.app.confidenceThreshold);
  const payloadMapper = new ClickUpPayloadMapper(config.clickup, logger);
  const webhookVerifier = new WebhookVerifier(config.clickup, logger);
  const rateLimiter = new RateLimiter(requestRepository, config.app.rateLimit, config.app.rateWindowSeconds);
  const bitlyService = new BitlyService(httpClient, config.bitly);
  const qrCodeService = new QrCodeService(config.qr);
  const clickUpChatService = new ClickUpChatService(httpClient, config.clickup);
  const messageFormatter = new MessageFormatter();
  const workflowService = new LinkWorkflowService({
    requestRepository,
    generatedLinkRepository,
    auditLogRepository,
    rateLimiter,
    linkRequestParser,
    requestNormalizer,
    fingerprintService,
    bitlyService,
    qrCodeService,
    clickUpChatService,
    messageFormatter,
    logger
  });

  const healthController = new HealthController(database);
  const debugController = new DebugController({
    debugEnabled: config.app.debug || config.clickup.debugWebhook,
    fixtureDirectory: path.join(projectRoot, "tests", "fixtures"),
    defaultFixture: "clickup-chat-message.json",
    config
  });
  const clickUpWebhookController = new ClickUpWebhookController({
    payloadMapper,
    webhookVerifier,
    requestRepository,
    auditLogRepository,
    workflowService,
    logger,
    debugEnabled: config.app.debug || config.clickup.debugWebhook
  });

  const router = new Router();
  router.add("GET", "/health", (request) => healthController.handle(request));
  router.add("GET", "/debug/sample-payload", (request) => debugController.handleSample(request));
  router.add("GET", "/debug/webhook-info", (request) => debugController.handleInfo(request));
  router.add("POST", "/debug/webhook-echo", (request) => debugController.handleEcho(request));
  router.add("POST", "/webhooks/clickup/chat", (request) => clickUpWebhookController.handle(request));

  return new Application(router, migrationRunner, config);
}

function resolveConfig(projectRoot) {
  return {
    app: {
      name: baseConfig.app.name,
      env: process.env.APP_ENV ?? baseConfig.app.env,
      url: process.env.APP_URL ?? baseConfig.app.url,
      debug: parseBoolean(process.env.APP_DEBUG, baseConfig.app.debug),
      port: Number(process.env.APP_PORT ?? baseConfig.app.port),
      timezone: process.env.DEFAULT_TIMEZONE ?? baseConfig.app.timezone,
      confidenceThreshold: Number(process.env.PARSER_CONFIDENCE_THRESHOLD ?? baseConfig.app.confidenceThreshold),
      rateLimit: Number(process.env.REQUEST_RATE_LIMIT ?? baseConfig.app.rateLimit),
      rateWindowSeconds: Number(process.env.REQUEST_RATE_WINDOW_SECONDS ?? baseConfig.app.rateWindowSeconds)
    },
    database: {
      path: absolutePath(process.env.DATABASE_PATH ?? baseConfig.database.path, projectRoot)
    },
    logging: {
      path: absolutePath(process.env.LOG_PATH ?? baseConfig.logging.path, projectRoot)
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY ?? baseConfig.openai.apiKey,
      model: process.env.OPENAI_MODEL ?? baseConfig.openai.model,
      apiBase: baseConfig.openai.apiBase,
      temperature: baseConfig.openai.temperature,
      timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? baseConfig.openai.timeoutMs)
    },
    clickup: {
      apiToken: process.env.CLICKUP_API_TOKEN ?? baseConfig.clickup.apiToken,
      workspaceId: process.env.CLICKUP_WORKSPACE_ID ?? baseConfig.clickup.workspaceId,
      defaultChannelId: process.env.CLICKUP_CHAT_CHANNEL_ID ?? baseConfig.clickup.defaultChannelId,
      allowedChannelIds: csv(process.env.CLICKUP_ALLOWED_CHANNEL_IDS ?? process.env.CLICKUP_CHAT_CHANNEL_ID ?? ""),
      webhookSecret: process.env.CLICKUP_WEBHOOK_SECRET ?? baseConfig.clickup.webhookSecret,
      signatureHeader: process.env.CLICKUP_SIGNATURE_HEADER ?? baseConfig.clickup.signatureHeader,
      debugWebhook: parseBoolean(process.env.DEBUG_WEBHOOK, baseConfig.clickup.debugWebhook),
      debugSkipSignature: parseBoolean(process.env.DEBUG_WEBHOOK_SKIP_SIGNATURE, baseConfig.clickup.debugSkipSignature),
      debugSkipChannelCheck: parseBoolean(process.env.DEBUG_WEBHOOK_SKIP_CHANNEL_CHECK, baseConfig.clickup.debugSkipChannelCheck),
      debugSkipWorkspaceCheck: parseBoolean(process.env.DEBUG_WEBHOOK_SKIP_WORKSPACE_CHECK, baseConfig.clickup.debugSkipWorkspaceCheck),
      apiBase: process.env.CLICKUP_API_BASE_URL ?? baseConfig.clickup.apiBase,
      messageContentField: process.env.CLICKUP_CHAT_MESSAGE_CONTENT_FIELD ?? baseConfig.clickup.messageContentField,
      messageFallbackField: process.env.CLICKUP_CHAT_MESSAGE_FALLBACK_FIELD ?? baseConfig.clickup.messageFallbackField,
      ignoreUserIds: csv(process.env.CLICKUP_IGNORE_USER_IDS ?? ""),
      ignoreUsernames: csv(process.env.CLICKUP_IGNORE_USERNAMES ?? ""),
      timeoutMs: Number(process.env.CLICKUP_TIMEOUT_MS ?? baseConfig.clickup.timeoutMs)
    },
    bitly: {
      accessToken: process.env.BITLY_ACCESS_TOKEN ?? baseConfig.bitly.accessToken,
      domain: process.env.BITLY_DOMAIN ?? baseConfig.bitly.domain,
      groupGuid: process.env.BITLY_GROUP_GUID ?? baseConfig.bitly.groupGuid,
      apiBase: baseConfig.bitly.apiBase,
      timeoutMs: Number(process.env.BITLY_TIMEOUT_MS ?? baseConfig.bitly.timeoutMs)
    },
    qr: {
      baseUrl: process.env.QR_BASE_URL ?? baseConfig.qr.baseUrl,
      size: process.env.QR_SIZE ?? baseConfig.qr.size
    }
  };
}

function absolutePath(targetPath, projectRoot) {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }

  return path.join(projectRoot, targetPath);
}

function csv(value) {
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}
