import type Database from "better-sqlite3";
import { createDatabaseConnection } from "./connection.js";
import { migrations } from "./migrations.js";

function ensureSchemaMigrationsTable(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function getAppliedMigrationIds(database: Database.Database) {
  const rows = database
    .prepare("SELECT id FROM schema_migrations")
    .all() as Array<{ id: string }>;

  return new Set(rows.map((row) => row.id));
}

export function runMigrations(database: Database.Database) {
  ensureSchemaMigrationsTable(database);
  const appliedMigrationIds = getAppliedMigrationIds(database);

  const insertMigration = database.prepare(
    `
      INSERT INTO schema_migrations (id, description)
      VALUES (@id, @description)
    `,
  );

  for (const migration of migrations) {
    if (appliedMigrationIds.has(migration.id)) {
      continue;
    }

    const applyMigration = database.transaction((sql: string, id: string, description: string) => {
      database.exec(sql);
      insertMigration.run({
        id,
        description
      });
    });

    applyMigration(migration.sql, migration.id, migration.description);
  }
}

export function migrateDatabase() {
  const database = createDatabaseConnection();

  try {
    runMigrations(database);
  } finally {
    database.close();
  }
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  migrateDatabase();
}
