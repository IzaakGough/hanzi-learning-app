import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { MappingAdminInputPayload, MappingKind, PinyinMappingRecord } from "@hanzi-learning-app/shared";

interface PinyinMappingRow {
  id: string;
  kind: MappingKind;
  symbol: string;
  mapped_value: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: PinyinMappingRow): PinyinMappingRecord {
  return {
    id: row.id,
    kind: row.kind,
    symbol: row.symbol,
    mappedValue: row.mapped_value,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class MappingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MappingConflictError";
  }
}

export class MappingNotFoundError extends Error {
  constructor(id: string) {
    super(`Mapping not found: ${id}`);
    this.name = "MappingNotFoundError";
  }
}

export function listMappings(database: Database.Database) {
  const rows = database.prepare(`
    SELECT
      id,
      kind,
      symbol,
      mapped_value,
      notes,
      created_at,
      updated_at
    FROM pinyin_mappings
    ORDER BY
      CASE kind
        WHEN 'initial' THEN 0
        WHEN 'final' THEN 1
        ELSE 2
      END,
      symbol COLLATE NOCASE ASC
  `).all() as PinyinMappingRow[];

  return rows.map(mapRow);
}

export function createMapping(database: Database.Database, input: MappingAdminInputPayload) {
  const now = new Date().toISOString();
  const existing = database.prepare(`
    SELECT id
    FROM pinyin_mappings
    WHERE kind = ? AND symbol = ?
  `).get(input.kind, input.symbol) as { id: string } | undefined;

  if (existing) {
    throw new MappingConflictError(`A ${input.kind} mapping for ${input.symbol} already exists.`);
  }

  const id = randomUUID();

  database.prepare(`
    INSERT INTO pinyin_mappings (
      id,
      kind,
      symbol,
      mapped_value,
      notes,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @kind,
      @symbol,
      @mappedValue,
      @notes,
      @createdAt,
      @updatedAt
    )
  `).run({
    id,
    kind: input.kind,
    symbol: input.symbol,
    mappedValue: input.mappedValue,
    notes: input.notes,
    createdAt: now,
    updatedAt: now
  });

  return getMappingById(database, id);
}

export function updateMapping(
  database: Database.Database,
  id: string,
  input: MappingAdminInputPayload
) {
  const existing = getMappingRowById(database, id);

  if (!existing) {
    throw new MappingNotFoundError(id);
  }

  const duplicate = database.prepare(`
    SELECT id
    FROM pinyin_mappings
    WHERE kind = ? AND symbol = ? AND id != ?
  `).get(input.kind, input.symbol, id) as { id: string } | undefined;

  if (duplicate) {
    throw new MappingConflictError(`A ${input.kind} mapping for ${input.symbol} already exists.`);
  }

  database.prepare(`
    UPDATE pinyin_mappings
    SET
      kind = @kind,
      symbol = @symbol,
      mapped_value = @mappedValue,
      notes = @notes,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id,
    kind: input.kind,
    symbol: input.symbol,
    mappedValue: input.mappedValue,
    notes: input.notes,
    updatedAt: new Date().toISOString()
  });

  return getMappingById(database, id);
}

function getMappingById(database: Database.Database, id: string) {
  const row = getMappingRowById(database, id);

  if (!row) {
    throw new MappingNotFoundError(id);
  }

  return mapRow(row);
}

function getMappingRowById(database: Database.Database, id: string) {
  return database.prepare(`
    SELECT
      id,
      kind,
      symbol,
      mapped_value,
      notes,
      created_at,
      updated_at
    FROM pinyin_mappings
    WHERE id = ?
  `).get(id) as PinyinMappingRow | undefined;
}
