import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function connectDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");

  return database;
}
