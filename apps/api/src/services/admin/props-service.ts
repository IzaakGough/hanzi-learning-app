import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { PropAdminInputPayload, PropRecord, PropType } from "@hanzi-learning-app/shared";

interface PropRow {
  id: string;
  name: string;
  type: PropType;
  shape_ref: string | null;
  meaning_or_image: string;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: PropRow): PropRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    shapeRef: row.shape_ref,
    meaningOrImage: row.meaning_or_image,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getStoredMeaningOrImage(input: {
  name: string;
  shapeRef: string | null;
  meaningOrImage: string | null;
}) {
  return input.meaningOrImage ?? input.shapeRef ?? input.name;
}

export class PropConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PropConflictError";
  }
}

export class PropNotFoundError extends Error {
  constructor(id: string) {
    super(`Prop not found: ${id}`);
    this.name = "PropNotFoundError";
  }
}

export class InvalidPropError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPropError";
  }
}

function validatePropInput(database: Database.Database, input: PropAdminInputPayload) {
  if (input.type !== "known_character") {
    return;
  }

  if (!input.shapeRef) {
    throw new InvalidPropError("Known character props require a shape ref.");
  }

  const character = database.prepare(`
    SELECT id
    FROM characters
    WHERE hanzi = ?
  `).get(input.shapeRef) as { id: string } | undefined;

  if (!character) {
    throw new InvalidPropError(
      `Known character props must reference an existing character. ${input.shapeRef} was not found.`
    );
  }
}

export function listProps(database: Database.Database, search?: string | null) {
  const trimmedSearch = search?.trim();

  if (!trimmedSearch) {
    const rows = database.prepare(`
      SELECT
        id,
        name,
        type,
        shape_ref,
        meaning_or_image,
        notes,
        is_active,
        created_at,
        updated_at
      FROM props
      ORDER BY name COLLATE NOCASE ASC
    `).all() as PropRow[];

    return rows.map(mapRow);
  }

  const pattern = `%${trimmedSearch}%`;
  const rows = database.prepare(`
    SELECT
      id,
      name,
      type,
      shape_ref,
      meaning_or_image,
      notes,
      is_active,
      created_at,
      updated_at
    FROM props
    WHERE name LIKE @pattern COLLATE NOCASE
      OR meaning_or_image LIKE @pattern COLLATE NOCASE
    ORDER BY name COLLATE NOCASE ASC
  `).all({ pattern }) as PropRow[];

  return rows.map(mapRow);
}

export function createProp(database: Database.Database, input: PropAdminInputPayload) {
  validatePropInput(database, input);
  const now = new Date().toISOString();
  const existing = database.prepare(`
    SELECT id
    FROM props
    WHERE name = ?
  `).get(input.name) as { id: string } | undefined;

  if (existing) {
    throw new PropConflictError(`A prop named ${input.name} already exists.`);
  }

  const id = randomUUID();

  database.prepare(`
    INSERT INTO props (
      id,
      name,
      type,
      shape_ref,
      meaning_or_image,
      notes,
      is_active,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @name,
      @type,
      @shapeRef,
      @meaningOrImage,
      @notes,
      @isActive,
      @createdAt,
      @updatedAt
    )
  `).run({
    id,
    name: input.name,
    type: input.type,
    shapeRef: input.shapeRef,
    meaningOrImage: getStoredMeaningOrImage(input),
    notes: input.notes,
    isActive: input.isActive ? 1 : 0,
    createdAt: now,
    updatedAt: now
  });

  return getPropById(database, id);
}

export function updateProp(
  database: Database.Database,
  id: string,
  input: PropAdminInputPayload
) {
  validatePropInput(database, input);
  const existing = getPropRowById(database, id);

  if (!existing) {
    throw new PropNotFoundError(id);
  }

  const duplicate = database.prepare(`
    SELECT id
    FROM props
    WHERE name = ? AND id != ?
  `).get(input.name, id) as { id: string } | undefined;

  if (duplicate) {
    throw new PropConflictError(`A prop named ${input.name} already exists.`);
  }

  database.prepare(`
    UPDATE props
    SET
      name = @name,
      type = @type,
      shape_ref = @shapeRef,
      meaning_or_image = @meaningOrImage,
      notes = @notes,
      is_active = @isActive,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id,
    name: input.name,
    type: input.type,
    shapeRef: input.shapeRef,
    meaningOrImage: getStoredMeaningOrImage(input),
    notes: input.notes,
    isActive: input.isActive ? 1 : 0,
    updatedAt: new Date().toISOString()
  });

  return getPropById(database, id);
}

function getPropById(database: Database.Database, id: string) {
  const row = getPropRowById(database, id);

  if (!row) {
    throw new PropNotFoundError(id);
  }

  return mapRow(row);
}

function getPropRowById(database: Database.Database, id: string) {
  return database.prepare(`
    SELECT
      id,
      name,
      type,
      shape_ref,
      meaning_or_image,
      notes,
      is_active,
      created_at,
      updated_at
    FROM props
    WHERE id = ?
  `).get(id) as PropRow | undefined;
}
