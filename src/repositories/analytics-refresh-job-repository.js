export class AnalyticsRefreshJobRepository {
  constructor(database) {
    this.database = database;
  }

  findPendingByScope(websiteId, dateFrom = null, dateTo = null) {
    return this.database.prepare(`
      SELECT *
      FROM analytics_refresh_jobs
      WHERE website_id = :website_id
        AND status = 'pending'
        AND COALESCE(date_from, '') = COALESCE(:date_from, '')
        AND COALESCE(date_to, '') = COALESCE(:date_to, '')
      ORDER BY id DESC
      LIMIT 1
    `).get({
      website_id: websiteId,
      date_from: dateFrom,
      date_to: dateTo
    }) ?? null;
  }

  enqueue(payload) {
    const existing = this.findPendingByScope(payload.websiteId, payload.dateFrom ?? null, payload.dateTo ?? null);
    if (existing) {
      this.database.prepare(`
        UPDATE analytics_refresh_jobs
        SET reason = :reason,
            available_at = :available_at,
            last_requested_at = :last_requested_at,
            updated_at = :updated_at
        WHERE id = :id
      `).run({
        id: existing.id,
        reason: payload.reason ?? existing.reason ?? "",
        available_at: payload.availableAt,
        last_requested_at: payload.lastRequestedAt,
        updated_at: payload.updatedAt
      });

      return Number(existing.id);
    }

    const result = this.database.prepare(`
      INSERT INTO analytics_refresh_jobs (
        website_id,
        date_from,
        date_to,
        reason,
        status,
        attempts,
        available_at,
        started_at,
        completed_at,
        last_error,
        last_requested_at,
        created_at,
        updated_at
      ) VALUES (
        :website_id,
        :date_from,
        :date_to,
        :reason,
        'pending',
        0,
        :available_at,
        NULL,
        NULL,
        NULL,
        :last_requested_at,
        :created_at,
        :updated_at
      )
    `).run({
      website_id: payload.websiteId,
      date_from: payload.dateFrom ?? null,
      date_to: payload.dateTo ?? null,
      reason: payload.reason ?? "",
      available_at: payload.availableAt,
      last_requested_at: payload.lastRequestedAt,
      created_at: payload.createdAt,
      updated_at: payload.updatedAt
    });

    return Number(result.lastInsertRowid);
  }

  listRunnable(beforeIso, limit) {
    return this.database.prepare(`
      SELECT *
      FROM analytics_refresh_jobs
      WHERE status = 'pending'
        AND available_at <= :available_at
      ORDER BY available_at ASC, id ASC
      LIMIT :limit
    `).all({
      available_at: beforeIso,
      limit: Number(limit)
    });
  }

  claim(id, startedAt) {
    const result = this.database.prepare(`
      UPDATE analytics_refresh_jobs
      SET status = 'processing',
          attempts = attempts + 1,
          started_at = :started_at,
          updated_at = :updated_at
      WHERE id = :id
        AND status = 'pending'
    `).run({
      id,
      started_at: startedAt,
      updated_at: startedAt
    });

    return Number(result.changes ?? 0) > 0;
  }

  markCompleted(id, completedAt) {
    this.database.prepare(`
      UPDATE analytics_refresh_jobs
      SET status = 'completed',
          completed_at = :completed_at,
          last_error = NULL,
          updated_at = :updated_at
      WHERE id = :id
    `).run({
      id,
      completed_at: completedAt,
      updated_at: completedAt
    });
  }

  markRetry(id, errorMessage, availableAt) {
    this.database.prepare(`
      UPDATE analytics_refresh_jobs
      SET status = 'pending',
          available_at = :available_at,
          last_error = :last_error,
          updated_at = :updated_at
      WHERE id = :id
    `).run({
      id,
      available_at: availableAt,
      last_error: errorMessage,
      updated_at: availableAt
    });
  }

  latestForWebsiteIds(websiteIds) {
    const ids = normalizeIds(websiteIds);
    if (ids.length === 0) {
      return [];
    }

    return this.database.prepare(`
      SELECT job.*
      FROM analytics_refresh_jobs job
      INNER JOIN (
        SELECT website_id, MAX(id) AS max_id
        FROM analytics_refresh_jobs
        WHERE website_id IN (${ids.join(", ")})
        GROUP BY website_id
      ) latest ON latest.max_id = job.id
      ORDER BY job.website_id ASC
    `).all();
  }
}

function normalizeIds(websiteIds) {
  return websiteIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
}
