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
import { UtmLibraryController } from "../controllers/utm-library-controller.js";
import { UtmBuilderController } from "../controllers/utm-builder-controller.js";
import { UtmImportController } from "../controllers/utm-import-controller.js";
import { TrackingController } from "../controllers/tracking-controller.js";
import { WebsiteAdminController } from "../controllers/website-admin-controller.js";
import { ReportingController } from "../controllers/reporting-controller.js";
import { RequestRepository } from "../repositories/request-repository.js";
import { GeneratedLinkRepository } from "../repositories/generated-link-repository.js";
import { AuditLogRepository } from "../repositories/audit-log-repository.js";
import { ClientRepository } from "../repositories/client-repository.js";
import { WebsiteRepository } from "../repositories/website-repository.js";
import { VisitorRepository } from "../repositories/visitor-repository.js";
import { SessionRepository } from "../repositories/session-repository.js";
import { TrackingEventRepository } from "../repositories/tracking-event-repository.js";
import { ConversionRepository } from "../repositories/conversion-repository.js";
import { StitchedProfileRepository } from "../repositories/stitched-profile-repository.js";
import { WebsiteObservabilityEventRepository } from "../repositories/website-observability-event-repository.js";
import { WebsiteInstallationRepository } from "../repositories/website-installation-repository.js";
import { WebsiteInstallationEventRepository } from "../repositories/website-installation-event-repository.js";
import { WebsiteCredentialEventRepository } from "../repositories/website-credential-event-repository.js";
import { ConversionAttributionRepository } from "../repositories/conversion-attribution-repository.js";
import { AnalyticsRefreshJobRepository } from "../repositories/analytics-refresh-job-repository.js";
import { AnalyticsRollupRepository } from "../repositories/analytics-rollup-repository.js";
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
import { LinkGenerationService } from "../services/link-generation-service.js";
import { LinkWorkflowService } from "../services/link-workflow-service.js";
import { UtmLibraryService } from "../services/utm-library-service.js";
import { UtmLibraryEditorService } from "../services/utm-library-editor-service.js";
import { BasicAuthService } from "../services/basic-auth-service.js";
import { XlsxWorkbookReader } from "../services/xlsx-workbook-reader.js";
import { TrackerImportService } from "../services/tracker-import-service.js";
import { ReceivedRequestRecoveryService } from "../services/received-request-recovery-service.js";
import { TrackingAuthService } from "../services/tracking-auth-service.js";
import { TrackingIngestionService } from "../services/tracking-ingestion-service.js";
import { PluginConfigService } from "../services/plugin-config-service.js";
import { WebsiteProvisioningService } from "../services/website-provisioning-service.js";
import { PluginTelemetryService } from "../services/plugin-telemetry-service.js";
import { WebsiteAdministrationService } from "../services/website-administration-service.js";
import { AnalyticsReportingService } from "../services/analytics-reporting-service.js";
import { AnalyticsRefreshService } from "../services/analytics-refresh-service.js";
import { IdentityStitchingService } from "../services/identity-stitching-service.js";
import { WebsiteHealthService } from "../services/website-health-service.js";

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
  const utmLibraryService = new UtmLibraryService(requestRepository);
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
  const libraryAuthService = new BasicAuthService(config.libraryAuth);
  const trackingAuthService = new TrackingAuthService({
    websiteRepository,
    websiteObservabilityEventRepository,
    encryptionKey: config.tracking.secretEncryptionKey,
    maxAgeSeconds: config.tracking.signatureMaxAgeSeconds,
    logger
  });
  const workbookReader = new XlsxWorkbookReader();
  const linkGenerationService = new LinkGenerationService({
    generatedLinkRepository,
    bitlyService,
    qrCodeService
  });
  const workflowService = new LinkWorkflowService({
    requestRepository,
    auditLogRepository,
    rateLimiter,
    linkRequestParser,
    requestNormalizer,
    fingerprintService,
    linkGenerationService,
    clickUpChatService,
    messageFormatter,
    logger
  });
  const utmLibraryEditorService = new UtmLibraryEditorService({
    requestRepository,
    requestNormalizer,
    fingerprintService,
    linkGenerationService,
    generatedLinkRepository
  });
  const trackerImportService = new TrackerImportService({
    workbookReader,
    requestRepository,
    generatedLinkRepository,
    rulesService,
    fingerprintService,
    urlService,
    qrCodeService
  });
  const pluginConfigService = new PluginConfigService();
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
  const websiteHealthService = new WebsiteHealthService({
    staleHours: config.app.websiteHealthStaleHours,
    heartbeatGapHours: config.app.websiteHealthHeartbeatGapHours,
    trafficGapHours: config.app.websiteHealthTrafficGapHours,
    failureWindowHours: config.app.websiteHealthFailureWindowHours
  });
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
    logger,
    enabled: config.app.analyticsRefreshEnabled,
    intervalMs: config.app.analyticsRefreshPollMs,
    batchSize: config.app.analyticsRefreshBatchSize,
    retryDelayMs: config.app.analyticsRefreshRetryDelayMs
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
    analyticsRefreshService,
    identityStitchingService,
    analyticsReportingService,
    logger
  });
  const receivedRequestRecoveryService = new ReceivedRequestRecoveryService({
    requestRepository,
    auditLogRepository,
    workflowService,
    logger,
    enabled: config.app.recoveryEnabled,
    intervalMs: config.app.recoveryPollMs,
    graceSeconds: config.app.recoveryGraceSeconds,
    batchSize: config.app.recoveryBatchSize
  });

  const healthController = new HealthController({ database, config });
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
  const utmLibraryController = new UtmLibraryController({
    utmLibraryService,
    utmLibraryEditorService,
    rulesService
  });
  const utmBuilderController = new UtmBuilderController({
    utmLibraryEditorService,
    rulesService
  });
  const utmImportController = new UtmImportController({
    trackerImportService
  });
  const trackingController = new TrackingController({
    trackingAuthService,
    trackingIngestionService,
    pluginConfigService,
    websiteRepository,
    pluginTelemetryService,
    websiteObservabilityEventRepository
  });
  const websiteAdminController = new WebsiteAdminController({
    websiteAdministrationService,
    rulesService
  });
  const reportingController = new ReportingController({
    analyticsReportingService,
    analyticsRefreshService
  });

  const router = new Router();
  router.add("GET", "/health", (request) => healthController.handle(request));
  router.add("POST", "/api/v1/tracking/events/batch", (request) => trackingController.handleBatch(request));
  router.add("GET", "/api/v1/plugin/config", (request) => trackingController.handleConfig(request));
  router.add("POST", "/api/v1/plugin/heartbeat", (request) => trackingController.handleHeartbeat(request));
  router.add("GET", "/admin/websites", protectLibraryRoute(libraryAuthService, (request) => websiteAdminController.handleHtml(request)));
  router.add("POST", "/admin/websites", protectLibraryRoute(libraryAuthService, (request) => websiteAdminController.handleCreate(request)));
  router.add("POST", "/admin/websites/rotate", protectLibraryRoute(libraryAuthService, (request) => websiteAdminController.handleRotate(request)));
  router.add("POST", "/admin/websites/status", protectLibraryRoute(libraryAuthService, (request) => websiteAdminController.handleStatus(request)));
  router.add("GET", "/admin/reports", protectLibraryRoute(libraryAuthService, (request) => reportingController.handleHtml(request)));
  router.add("GET", "/admin/reports.json", protectLibraryRoute(libraryAuthService, (request) => reportingController.handleJson(request)));
  router.add("GET", "/admin/reports/traffic.json", protectLibraryRoute(libraryAuthService, (request) => reportingController.handleTrafficJson(request)));
  router.add("GET", "/admin/reports/funnel.json", protectLibraryRoute(libraryAuthService, (request) => reportingController.handleFunnelJson(request)));
  router.add("GET", "/new", protectLibraryRoute(libraryAuthService, (request) => utmBuilderController.handleHtml(request)));
  router.add("POST", "/new", protectLibraryRoute(libraryAuthService, (request) => utmBuilderController.handleCreate(request)));
  router.add("GET", "/imports", protectLibraryRoute(libraryAuthService, (request) => utmImportController.handleHtml(request)));
  router.add("POST", "/imports", protectLibraryRoute(libraryAuthService, (request) => utmImportController.handleImport(request)));
  router.add("POST", "/imports/reset", protectLibraryRoute(libraryAuthService, (request) => utmImportController.handleReset(request)));
  router.add("GET", "/utms", protectLibraryRoute(libraryAuthService, (request) => utmLibraryController.handleHtml(request)));
  router.add("GET", "/utms.json", protectLibraryRoute(libraryAuthService, (request) => utmLibraryController.handleJson(request)));
  router.add("GET", "/utms.csv", protectLibraryRoute(libraryAuthService, (request) => utmLibraryController.handleCsv(request)));
  router.add("POST", "/utms/regenerate", protectLibraryRoute(libraryAuthService, (request) => utmLibraryController.handleRegenerate(request)));
  router.add("POST", "/utms/delete", protectLibraryRoute(libraryAuthService, (request) => utmLibraryController.handleDelete(request)));
  router.add("GET", "/debug/sample-payload", (request) => debugController.handleSample(request));
  router.add("GET", "/debug/webhook-info", (request) => debugController.handleInfo(request));
  router.add("POST", "/debug/webhook-echo", (request) => debugController.handleEcho(request));
  router.add("POST", "/webhooks/clickup/chat", (request) => clickUpWebhookController.handle(request));

  return new Application(router, migrationRunner, config, {
    start: async () => {
      receivedRequestRecoveryService.start();
      if (config.app.analyticsRefreshMode === "in_process") {
        analyticsRefreshService.start();
      }
    },
    stop: async () => {
      receivedRequestRecoveryService.stop();
      analyticsRefreshService.stop();
    }
  });
}

export async function createAnalyticsWorker(projectRoot) {
  loadEnvFile(path.join(projectRoot, ".env"));
  const config = resolveConfig(projectRoot);
  process.env.TZ = config.app.timezone;

  fs.mkdirSync(path.dirname(config.database.path), { recursive: true });
  fs.mkdirSync(path.dirname(config.logging.path), { recursive: true });

  const logger = new Logger(config.logging.path, config.app.debug);
  const database = connectDatabase(config.database.path);
  const migrationRunner = new MigrationRunner(database, path.join(projectRoot, "database", "migrations"));
  await migrationRunner.migrate();

  const clientRepository = new ClientRepository(database);
  const websiteRepository = new WebsiteRepository(database);
  const conversionAttributionRepository = new ConversionAttributionRepository(database);
  const analyticsRefreshJobRepository = new AnalyticsRefreshJobRepository(database);
  const analyticsRollupRepository = new AnalyticsRollupRepository(database);
  const analyticsReportingService = new AnalyticsReportingService({
    database,
    clientRepository,
    websiteRepository,
    conversionAttributionRepository,
    analyticsRollupRepository
  });
  const active = config.app.analyticsRefreshEnabled
    && config.app.analyticsRefreshMode === "external";
  const analyticsRefreshService = new AnalyticsRefreshService({
    websiteRepository,
    analyticsReportingService,
    analyticsRefreshJobRepository,
    logger,
    enabled: active,
    intervalMs: config.app.analyticsRefreshPollMs,
    batchSize: config.app.analyticsRefreshBatchSize,
    retryDelayMs: config.app.analyticsRefreshRetryDelayMs
  });

  return {
    config,
    active,
    async start() {
      analyticsRefreshService.start();
    },
    async stop() {
      analyticsRefreshService.stop();
    }
  };
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
      rateWindowSeconds: Number(process.env.REQUEST_RATE_WINDOW_SECONDS ?? baseConfig.app.rateWindowSeconds),
      recoveryEnabled: parseBoolean(process.env.REQUEST_RECOVERY_ENABLED, baseConfig.app.recoveryEnabled),
      recoveryPollMs: Number(process.env.REQUEST_RECOVERY_POLL_MS ?? baseConfig.app.recoveryPollMs),
      recoveryGraceSeconds: Number(process.env.REQUEST_RECOVERY_GRACE_SECONDS ?? baseConfig.app.recoveryGraceSeconds),
      recoveryBatchSize: Number(process.env.REQUEST_RECOVERY_BATCH_SIZE ?? baseConfig.app.recoveryBatchSize),
      analyticsRefreshEnabled: parseBoolean(process.env.ANALYTICS_REFRESH_ENABLED, baseConfig.app.analyticsRefreshEnabled),
      analyticsRefreshMode: normalizeAnalyticsRefreshMode(process.env.ANALYTICS_REFRESH_MODE, baseConfig.app.analyticsRefreshMode),
      analyticsRefreshPollMs: Number(process.env.ANALYTICS_REFRESH_POLL_MS ?? baseConfig.app.analyticsRefreshPollMs),
      analyticsRefreshBatchSize: Number(process.env.ANALYTICS_REFRESH_BATCH_SIZE ?? baseConfig.app.analyticsRefreshBatchSize),
      analyticsRefreshRetryDelayMs: Number(process.env.ANALYTICS_REFRESH_RETRY_DELAY_MS ?? baseConfig.app.analyticsRefreshRetryDelayMs),
      websiteHealthStaleHours: Number(process.env.WEBSITE_HEALTH_STALE_HOURS ?? baseConfig.app.websiteHealthStaleHours),
      websiteHealthHeartbeatGapHours: Number(process.env.WEBSITE_HEALTH_HEARTBEAT_GAP_HOURS ?? baseConfig.app.websiteHealthHeartbeatGapHours),
      websiteHealthTrafficGapHours: Number(process.env.WEBSITE_HEALTH_TRAFFIC_GAP_HOURS ?? baseConfig.app.websiteHealthTrafficGapHours),
      websiteHealthFailureWindowHours: Number(process.env.WEBSITE_HEALTH_FAILURE_WINDOW_HOURS ?? baseConfig.app.websiteHealthFailureWindowHours)
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
    },
    tracking: {
      secretEncryptionKey: process.env.TRACKING_SECRET_ENCRYPTION_KEY ?? baseConfig.tracking.secretEncryptionKey,
      signatureMaxAgeSeconds: Number(process.env.TRACKING_SIGNATURE_MAX_AGE_SECONDS ?? baseConfig.tracking.signatureMaxAgeSeconds)
    },
    libraryAuth: {
      enabled: parseBoolean(process.env.LIBRARY_AUTH_ENABLED, baseConfig.libraryAuth.enabled),
      username: process.env.LIBRARY_AUTH_USERNAME ?? baseConfig.libraryAuth.username,
      password: process.env.LIBRARY_AUTH_PASSWORD ?? baseConfig.libraryAuth.password,
      realm: process.env.LIBRARY_AUTH_REALM ?? baseConfig.libraryAuth.realm
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

function normalizeAnalyticsRefreshMode(value, fallback) {
  const normalized = String(value ?? fallback ?? "").trim().toLowerCase();
  return ["in_process", "external", "disabled"].includes(normalized)
    ? normalized
    : "in_process";
}

function protectLibraryRoute(authService, handler) {
  return async (request) => {
    const challenge = authService.protect(request);
    if (challenge) {
      return challenge;
    }

    return handler(request);
  };
}
