export class ClientRepository {
  constructor(database) {
    this.database = database;
  }

  findById(id) {
    return this.database.prepare(`
      SELECT *
      FROM clients
      WHERE id = :id
      LIMIT 1
    `).get({ id }) ?? null;
  }

  findByName(clientName) {
    return this.database.prepare(`
      SELECT *
      FROM clients
      WHERE client_name = :client_name COLLATE NOCASE
      LIMIT 1
    `).get({
      client_name: clientName
    }) ?? null;
  }

  create(payload) {
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO clients (
        client_name,
        status,
        created_at,
        updated_at
      ) VALUES (
        :client_name,
        :status,
        :created_at,
        :updated_at
      )
    `).run({
      client_name: payload.clientName,
      status: payload.status ?? "active",
      created_at: payload.createdAt,
      updated_at: payload.updatedAt
    });

    return Number(result.changes ?? 0) > 0
      ? Number(result.lastInsertRowid)
      : null;
  }

  list() {
    return this.database.prepare(`
      SELECT *
      FROM clients
      ORDER BY client_name COLLATE NOCASE ASC, id ASC
    `).all();
  }
}
