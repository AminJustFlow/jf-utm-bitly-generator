import fs from "node:fs";
import path from "node:path";

export class MigrationRunner {
  constructor(database, migrationPath) {
    this.database = database;
    this.migrationPath = migrationPath;
  }

  async migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        executed_at TEXT NOT NULL
      )
    `);

    if (!fs.existsSync(this.migrationPath)) {
      return;
    }

    const files = fs.readdirSync(this.migrationPath)
      .filter((file) => file.endsWith(".sql"))
      .sort((left, right) => left.localeCompare(right));

    for (const file of files) {
      const existing = this.database.prepare("SELECT COUNT(*) AS count FROM migrations WHERE filename = :filename")
        .get({ filename: file });

      if ((existing?.count ?? 0) > 0) {
        continue;
      }

      const sql = fs.readFileSync(path.join(this.migrationPath, file), "utf8");
      this.database.exec("BEGIN");
      try {
        this.database.exec(sql);
        this.database.prepare(
          "INSERT INTO migrations (filename, executed_at) VALUES (:filename, :executed_at)"
        ).run({
          filename: file,
          executed_at: new Date().toISOString()
        });
        this.database.exec("COMMIT");
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    }
  }
}
