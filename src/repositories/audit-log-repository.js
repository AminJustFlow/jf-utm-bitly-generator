export class AuditLogRepository {
  constructor(database) {
    this.database = database;
  }

  log(requestId, level, eventType, message, context = {}) {
    this.database.prepare(`
      INSERT INTO audit_logs (
        request_id,
        level,
        event_type,
        message,
        context_json,
        created_at
      ) VALUES (
        :request_id,
        :level,
        :event_type,
        :message,
        :context_json,
        :created_at
      )
    `).run({
      request_id: requestId,
      level,
      event_type: eventType,
      message,
      context_json: JSON.stringify(context),
      created_at: new Date().toISOString()
    });
  }
}
