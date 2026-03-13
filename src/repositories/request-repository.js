import crypto from "node:crypto";

function serializeValue(value) {
  if (value === undefined) {
    return null;
  }

  if (value !== null && typeof value === "object") {
    return JSON.stringify(value);
  }

  return value;
}

export class RequestRepository {
  constructor(database) {
    this.database = database;
  }

  findByDeliveryKey(deliveryKey) {
    return this.database.prepare("SELECT * FROM requests WHERE delivery_key = :delivery_key LIMIT 1")
      .get({ delivery_key: deliveryKey }) ?? null;
  }

  createIncoming(payload) {
    const statement = this.database.prepare(`
      INSERT INTO requests (
        request_uuid,
        delivery_key,
        status,
        original_message,
        raw_payload,
        clickup_workspace_id,
        clickup_channel_id,
        clickup_message_id,
        clickup_thread_message_id,
        source_user_id,
        source_user_name,
        created_at,
        updated_at
      ) VALUES (
        :request_uuid,
        :delivery_key,
        :status,
        :original_message,
        :raw_payload,
        :clickup_workspace_id,
        :clickup_channel_id,
        :clickup_message_id,
        :clickup_thread_message_id,
        :source_user_id,
        :source_user_name,
        :created_at,
        :updated_at
      )
    `);

    const result = statement.run({
      request_uuid: payload.requestUuid ?? crypto.randomUUID(),
      delivery_key: payload.deliveryKey,
      status: payload.status ?? "received",
      original_message: payload.originalMessage,
      raw_payload: serializeValue(payload.rawPayload ?? {}),
      clickup_workspace_id: payload.clickupWorkspaceId ?? null,
      clickup_channel_id: payload.clickupChannelId ?? null,
      clickup_message_id: payload.clickupMessageId ?? null,
      clickup_thread_message_id: payload.clickupThreadMessageId ?? null,
      source_user_id: payload.sourceUserId ?? "anonymous",
      source_user_name: payload.sourceUserName ?? null,
      created_at: payload.createdAt,
      updated_at: payload.updatedAt
    });

    return Number(result.lastInsertRowid);
  }

  update(id, fields) {
    const payload = {
      ...fields,
      updated_at: fields.updated_at ?? new Date().toISOString()
    };

    const assignments = Object.keys(payload).map((field) => `${field} = :${field}`).join(", ");
    const statement = this.database.prepare(`UPDATE requests SET ${assignments} WHERE id = :id`);
    const values = { id };

    for (const [key, value] of Object.entries(payload)) {
      values[key] = serializeValue(value);
    }

    statement.run(values);
  }

  countRecentByActorChannel(userId, channelId, since) {
    const row = this.database.prepare(`
      SELECT COUNT(*) AS count FROM requests
      WHERE clickup_channel_id = :channel_id
      AND source_user_id = :source_user_id
      AND created_at >= :since
    `).get({
      channel_id: channelId,
      source_user_id: userId,
      since
    });

    return Number(row?.count ?? 0);
  }
}
