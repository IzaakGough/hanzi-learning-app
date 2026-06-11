import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";

function escapeSqliteString(value: string) {
  return value.replace(/'/g, "''");
}

export function timestampFileFragment(now = new Date()) {
  return now.toISOString().replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
}

export function createDatabaseBackup(database: Database.Database, outputPath: string) {
  const resolvedOutputPath = path.resolve(outputPath);

  if (fs.existsSync(resolvedOutputPath)) {
    throw new Error(`Backup file already exists: ${resolvedOutputPath}`);
  }

  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  database.pragma("wal_checkpoint(FULL)");
  database.exec(`VACUUM INTO '${escapeSqliteString(resolvedOutputPath)}'`);

  return resolvedOutputPath;
}
