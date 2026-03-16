export class AnalyticsRefreshService {
  constructor({
    websiteRepository,
    analyticsReportingService,
    analyticsRefreshJobRepository,
    logger = null,
    enabled = true,
    intervalMs = 15000,
    batchSize = 4,
    retryDelayMs = 60000
  }) {
    this.websiteRepository = websiteRepository;
    this.analyticsReportingService = analyticsReportingService;
    this.analyticsRefreshJobRepository = analyticsRefreshJobRepository;
    this.logger = logger;
    this.enabled = Boolean(enabled);
    this.intervalMs = Math.max(1000, Number(intervalMs ?? 15000));
    this.batchSize = Math.max(1, Number(batchSize ?? 4));
    this.retryDelayMs = Math.max(5000, Number(retryDelayMs ?? 60000));
    this.timer = null;
    this.running = false;
  }

  start() {
    if (!this.enabled || this.timer) {
      return;
    }

    setImmediate(() => {
      this.processPending().catch((error) => {
        this.logger?.error?.("Analytics refresh processing failed during startup.", {
          error: error.message
        });
      });
    });

    this.timer = setInterval(() => {
      this.processPending().catch((error) => {
        this.logger?.error?.("Analytics refresh processing failed.", {
          error: error.message
        });
      });
    }, this.intervalMs);

    if (typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  stop() {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  enqueueWebsiteRefresh(websiteId, {
    dateFrom = null,
    dateTo = null,
    reason = "analytics_refresh"
  } = {}) {
    if (!this.enabled) {
      return {
        queued: 0,
        website_ids: []
      };
    }

    const website = this.websiteRepository.findById(websiteId);
    if (!website) {
      return {
        queued: 0,
        website_ids: []
      };
    }

    const now = new Date().toISOString();
    this.analyticsRefreshJobRepository.enqueue({
      websiteId: Number(websiteId),
      dateFrom,
      dateTo,
      reason,
      availableAt: now,
      lastRequestedAt: now,
      createdAt: now,
      updatedAt: now
    });

    return {
      queued: 1,
      website_ids: [Number(websiteId)]
    };
  }

  enqueueScopeRefresh({
    clientId = null,
    websiteId = null,
    dateFrom = null,
    dateTo = null,
    reason = "report_view"
  } = {}) {
    if (!this.enabled) {
      return {
        queued: 0,
        website_ids: [],
        latest_jobs: []
      };
    }

    const websites = this.resolveScopeWebsites({ clientId, websiteId });
    websites.forEach((website) => {
      this.enqueueWebsiteRefresh(website.id, {
        dateFrom,
        dateTo,
        reason
      });
    });

    return {
      queued: websites.length,
      website_ids: websites.map((website) => website.id),
      latest_jobs: this.analyticsRefreshJobRepository.latestForWebsiteIds(websites.map((website) => website.id))
    };
  }

  async processPending() {
    if (!this.enabled || this.running) {
      return;
    }

    this.running = true;

    try {
      const now = new Date().toISOString();
      const jobs = this.analyticsRefreshJobRepository.listRunnable(now, this.batchSize);

      for (const job of jobs) {
        const startedAt = new Date().toISOString();
        if (!this.analyticsRefreshJobRepository.claim(Number(job.id), startedAt)) {
          continue;
        }

        try {
          this.analyticsReportingService.refreshWebsite(Number(job.website_id), job.date_from || job.date_to
            ? {
                dateFrom: job.date_from || null,
                dateTo: job.date_to || null
              }
            : {
                fullRebuild: true
              });
          this.analyticsRefreshJobRepository.markCompleted(Number(job.id), new Date().toISOString());
        } catch (error) {
          const retryAt = new Date(Date.now() + this.retryDelayMs).toISOString();
          this.analyticsRefreshJobRepository.markRetry(Number(job.id), error.message, retryAt);
          this.logger?.error?.("Analytics refresh job failed.", {
            jobId: Number(job.id),
            websiteId: Number(job.website_id),
            error: error.message
          });
        }
      }
    } finally {
      this.running = false;
    }
  }

  resolveScopeWebsites({ clientId = null, websiteId = null }) {
    const websites = this.websiteRepository.list().map((website) => ({
      id: Number(website.id),
      client_id: website.client_id === null || website.client_id === undefined ? null : Number(website.client_id)
    }));

    if (positiveInteger(websiteId)) {
      return websites.filter((website) => website.id === Number(websiteId));
    }

    if (positiveInteger(clientId)) {
      return websites.filter((website) => website.client_id === Number(clientId));
    }

    return [];
  }
}

function positiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
