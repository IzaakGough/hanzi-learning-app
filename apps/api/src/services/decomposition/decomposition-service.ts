import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  ItemSource,
  ItemStatus,
  type CharacterDecompositionRecord,
  type DecompositionCandidateCreateInputPayload,
  type DecompositionCharacterWorkspace,
  type DecompositionPartRecord,
  type DecompositionPartResolutionInputPayload,
  type DecompositionWorkspaceResponse,
  type PropType,
  type UnresolvedPropQueueItem
} from "@hanzi-learning-app/shared";
import { syncLearningStatuses } from "../learning/level-progression-service.js";

interface CharacterRow {
  id: string;
  hanzi: string;
  pinyin_display: string | null;
  meaning_primary: string | null;
  status: ItemStatus;
  blocked_reason: string | null;
}

interface LinkedWordRow {
  id: string;
  simplified: string;
  pinyin_display: string | null;
  meaning_primary: string | null;
  status: ItemStatus;
}

interface DecompositionRow {
  id: string;
  character_id: string;
  status: "candidate" | "approved" | "rejected";
  source: ItemSource;
  source_ref: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface DecompositionPartRow {
  id: string;
  decomposition_id: string;
  prop_id: string | null;
  character_id: string | null;
  literal_text: string | null;
  sort_order: number;
}

interface PropOptionRow {
  id: string;
  name: string;
  type: PropType;
  shape_ref: string | null;
  meaning_or_image: string;
  is_active: number;
}

export class DecompositionCharacterNotFoundError extends Error {
  constructor(id: string) {
    super(`Character ${id} was not found.`);
    this.name = "DecompositionCharacterNotFoundError";
  }
}

export class DecompositionCandidateNotFoundError extends Error {
  constructor(id: string) {
    super(`Decomposition candidate ${id} was not found.`);
    this.name = "DecompositionCandidateNotFoundError";
  }
}

export class DecompositionPartNotFoundError extends Error {
  constructor(id: string) {
    super(`Decomposition part ${id} was not found.`);
    this.name = "DecompositionPartNotFoundError";
  }
}

export class DecompositionApprovalBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecompositionApprovalBlockedError";
  }
}

function findCharacter(database: Database.Database, id: string) {
  return database.prepare(`
    SELECT
      id,
      hanzi,
      pinyin_display,
      meaning_primary,
      status,
      blocked_reason
    FROM characters
    WHERE id = ?
  `).get(id) as CharacterRow | undefined;
}

function loadLinkedWords(database: Database.Database, characterId: string) {
  return database.prepare(`
    SELECT DISTINCT
      w.id,
      w.simplified,
      w.pinyin_display,
      w.meaning_primary,
      w.status
    FROM word_characters wc
    INNER JOIN words w ON w.id = wc.word_id
    WHERE wc.character_id = ?
    ORDER BY w.status ASC, w.simplified ASC
  `).all(characterId) as LinkedWordRow[];
}

function loadDecompositionRows(database: Database.Database, characterId: string) {
  return database.prepare(`
    SELECT
      id,
      character_id,
      status,
      source,
      source_ref,
      notes,
      created_at,
      updated_at
    FROM character_decompositions
    WHERE character_id = ?
    ORDER BY
      CASE status
        WHEN 'approved' THEN 0
        WHEN 'candidate' THEN 1
        ELSE 2
      END,
      created_at ASC
  `).all(characterId) as DecompositionRow[];
}

function loadPartRows(database: Database.Database, decompositionId: string) {
  return database.prepare(`
    SELECT
      id,
      decomposition_id,
      prop_id,
      character_id,
      literal_text,
      sort_order
    FROM character_decomposition_parts
    WHERE decomposition_id = ?
    ORDER BY sort_order ASC
  `).all(decompositionId) as DecompositionPartRow[];
}

function partText(database: Database.Database, row: DecompositionPartRow) {
  if (row.literal_text) {
    return row.literal_text;
  }

  if (row.prop_id) {
    const prop = database.prepare(`
      SELECT name, shape_ref
      FROM props
      WHERE id = ?
    `).get(row.prop_id) as { name: string; shape_ref: string | null } | undefined;

    return prop?.shape_ref ?? prop?.name ?? row.prop_id;
  }

  if (row.character_id) {
    const character = database.prepare(`
      SELECT hanzi
      FROM characters
      WHERE id = ?
    `).get(row.character_id) as { hanzi: string } | undefined;

    return character?.hanzi ?? row.character_id;
  }

  return "";
}

function mapPart(database: Database.Database, row: DecompositionPartRow): DecompositionPartRecord {
  return {
    id: row.id,
    sortOrder: row.sort_order,
    resolutionKind: row.prop_id ? "prop" : row.character_id ? "character" : "literal",
    text: partText(database, row),
    propId: row.prop_id,
    characterId: row.character_id
  };
}

function mapDecomposition(database: Database.Database, row: DecompositionRow): CharacterDecompositionRecord {
  return {
    id: row.id,
    characterId: row.character_id,
    status: row.status,
    source: row.source,
    sourceRef: row.source_ref,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    parts: loadPartRows(database, row.id).map((part) => mapPart(database, part))
  };
}

function buildCharacterWorkspace(
  database: Database.Database,
  characterId: string
): DecompositionCharacterWorkspace {
  const character = findCharacter(database, characterId);

  if (!character) {
    throw new DecompositionCharacterNotFoundError(characterId);
  }

  const decompositions = loadDecompositionRows(database, characterId).map((row) => mapDecomposition(database, row));

  return {
    character: {
      id: character.id,
      hanzi: character.hanzi,
      pinyinDisplay: character.pinyin_display,
      meaningPrimary: character.meaning_primary,
      status: character.status,
      blockedReason: character.blocked_reason
    },
    approvedDecomposition: decompositions.find((entry) => entry.status === "approved") ?? null,
    candidates: decompositions.filter((entry) => entry.status === "candidate"),
    linkedWords: loadLinkedWords(database, characterId).map((row) => ({
      id: row.id,
      simplified: row.simplified,
      pinyinDisplay: row.pinyin_display,
      meaningPrimary: row.meaning_primary,
      status: row.status
    }))
  };
}

function loadActivePropOptions(database: Database.Database, literalText: string) {
  const likeValue = `%${literalText}%`;
  return database.prepare(`
    SELECT
      id,
      name,
      type,
      shape_ref,
      meaning_or_image,
      is_active
    FROM props
    WHERE is_active = 1
      AND (
        name LIKE @likeValue COLLATE NOCASE
        OR meaning_or_image LIKE @likeValue COLLATE NOCASE
        OR shape_ref = @literalText
      )
    ORDER BY
      CASE WHEN shape_ref = @literalText THEN 0 ELSE 1 END,
      name COLLATE NOCASE ASC
  `).all({
    likeValue,
    literalText
  }) as PropOptionRow[];
}

function findCandidateRow(database: Database.Database, candidateId: string) {
  return database.prepare(`
    SELECT
      id,
      character_id,
      status,
      source,
      source_ref,
      notes,
      created_at,
      updated_at
    FROM character_decompositions
    WHERE id = ?
  `).get(candidateId) as DecompositionRow | undefined;
}

function findPartRow(database: Database.Database, partId: string) {
  return database.prepare(`
    SELECT
      id,
      decomposition_id,
      prop_id,
      character_id,
      literal_text,
      sort_order
    FROM character_decomposition_parts
    WHERE id = ?
  `).get(partId) as DecompositionPartRow | undefined;
}

function createPropFromResolution(
  database: Database.Database,
  resolution: Extract<DecompositionPartResolutionInputPayload, { action: "create_known_character_prop" | "create_new_prop" }>
) {
  const duplicate = database.prepare(`
    SELECT id
    FROM props
    WHERE name = ?
  `).get(resolution.name) as { id: string } | undefined;

  if (duplicate) {
    throw new DecompositionApprovalBlockedError(`A prop named ${resolution.name} already exists.`);
  }

  const now = new Date().toISOString();
  const propId = randomUUID();
  const type: PropType = resolution.action === "create_known_character_prop" ? "known_character" : "component";

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
      1,
      @createdAt,
      @updatedAt
    )
  `).run({
    id: propId,
    name: resolution.name,
    type,
    shapeRef: resolution.shapeRef,
    meaningOrImage: resolution.meaningOrImage,
    notes: resolution.notes,
    createdAt: now,
    updatedAt: now
  });

  return propId;
}

export function listDecompositionWorkspace(database: Database.Database): DecompositionWorkspaceResponse {
  syncLearningStatuses(database);

  const characterRows = database.prepare(`
    SELECT
      c.id,
      c.hanzi,
      c.pinyin_display,
      c.meaning_primary,
      c.status,
      c.blocked_reason
    FROM characters c
    WHERE c.archived_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM character_decompositions cd
        WHERE cd.character_id = c.id
          AND cd.status = 'candidate'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM character_decompositions approved
        WHERE approved.character_id = c.id
          AND approved.status = 'approved'
      )
    ORDER BY
      CASE WHEN c.blocked_reason = 'missing_approved_decomposition' THEN 0 ELSE 1 END,
      c.hanzi ASC
  `).all() as CharacterRow[];

  const charactersNeedingApproval = characterRows.map((row) => buildCharacterWorkspace(database, row.id));

  const unresolvedProps = database.prepare(`
    SELECT
      cdp.id AS part_id,
      cdp.decomposition_id AS candidate_id,
      cd.character_id,
      c.hanzi AS character_hanzi,
      cdp.literal_text
    FROM character_decomposition_parts cdp
    INNER JOIN character_decompositions cd ON cd.id = cdp.decomposition_id
    INNER JOIN characters c ON c.id = cd.character_id
    WHERE cd.status = 'candidate'
      AND cdp.prop_id IS NULL
      AND cdp.character_id IS NULL
      AND cdp.literal_text IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM character_decompositions approved
        WHERE approved.character_id = cd.character_id
          AND approved.status = 'approved'
      )
    ORDER BY c.hanzi ASC, cdp.sort_order ASC
  `).all() as Array<{
    part_id: string;
    candidate_id: string;
    character_id: string;
    character_hanzi: string;
    literal_text: string;
  }>;

  return {
    charactersNeedingApproval,
    unresolvedProps: unresolvedProps.map((row) => {
      const blockedWordRows = database.prepare(`
        SELECT DISTINCT
          w.id,
          w.simplified,
          w.status
        FROM word_characters wc
        INNER JOIN words w ON w.id = wc.word_id
        WHERE wc.character_id = ?
          AND w.status = 'blocked'
        ORDER BY w.simplified ASC
      `).all(row.character_id) as Array<{ id: string; simplified: string; status: ItemStatus }>;

      const characterRow = findCharacter(database, row.character_id);
      const blockedDependencies: UnresolvedPropQueueItem["blockedDependencies"] = [];

      if (characterRow && characterRow.status === ItemStatus.Blocked) {
        blockedDependencies.push({
          id: characterRow.id,
          text: characterRow.hanzi,
          kind: "character",
          status: characterRow.status
        });
      }

      blockedWordRows.forEach((word) => {
        blockedDependencies.push({
          id: word.id,
          text: word.simplified,
          kind: "word",
          status: word.status
        });
      });

      return {
        partId: row.part_id,
        candidateId: row.candidate_id,
        characterId: row.character_id,
        characterHanzi: row.character_hanzi,
        literalText: row.literal_text,
        existingPropOptions: loadActivePropOptions(database, row.literal_text).map((prop) => ({
          id: prop.id,
          name: prop.name,
          type: prop.type,
          shapeRef: prop.shape_ref,
          meaningOrImage: prop.meaning_or_image,
          isActive: prop.is_active
        })),
        blockedDependencies
      };
    })
  };
}

export function createDecompositionCandidate(
  database: Database.Database,
  characterId: string,
  input: DecompositionCandidateCreateInputPayload
) {
  const character = findCharacter(database, characterId);

  if (!character) {
    throw new DecompositionCharacterNotFoundError(characterId);
  }

  const now = new Date().toISOString();
  const candidateId = randomUUID();

  const run = database.transaction(() => {
    database.prepare(`
      INSERT INTO character_decompositions (
        id,
        character_id,
        status,
        source,
        source_ref,
        notes,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @characterId,
        'candidate',
        @source,
        @sourceRef,
        @notes,
        @createdAt,
        @updatedAt
      )
    `).run({
      id: candidateId,
      characterId,
      source: ItemSource.Manual,
      sourceRef: "decomposition_workspace",
      notes: input.notes,
      createdAt: now,
      updatedAt: now
    });

    const insertPart = database.prepare(`
      INSERT INTO character_decomposition_parts (
        id,
        decomposition_id,
        literal_text,
        sort_order,
        created_at
      )
      VALUES (
        @id,
        @decompositionId,
        @literalText,
        @sortOrder,
        @createdAt
      )
    `);

    input.parts.forEach((part, index) => {
      insertPart.run({
        id: randomUUID(),
        decompositionId: candidateId,
        literalText: part,
        sortOrder: index,
        createdAt: now
      });
    });
  });

  run();
  syncLearningStatuses(database);
  return buildCharacterWorkspace(database, characterId);
}

export function resolveDecompositionPart(
  database: Database.Database,
  partId: string,
  input: DecompositionPartResolutionInputPayload
) {
  const part = findPartRow(database, partId);

  if (!part) {
    throw new DecompositionPartNotFoundError(partId);
  }

  const candidate = findCandidateRow(database, part.decomposition_id);

  if (!candidate) {
    throw new DecompositionCandidateNotFoundError(part.decomposition_id);
  }

  if (candidate.status !== "candidate") {
    throw new DecompositionApprovalBlockedError("Only candidate decomposition parts can be resolved.");
  }

  const run = database.transaction(() => {
    let propId: string | null = null;

    if (input.action === "match_existing_prop") {
      const prop = database.prepare(`
        SELECT id
        FROM props
        WHERE id = ? AND is_active = 1
      `).get(input.propId) as { id: string } | undefined;

      if (!prop) {
        throw new DecompositionApprovalBlockedError(`Prop ${input.propId} was not found.`);
      }

      propId = prop.id;
    } else {
      propId = createPropFromResolution(database, input);
    }

    database.prepare(`
      UPDATE character_decomposition_parts
      SET
        prop_id = @propId,
        character_id = NULL,
        literal_text = NULL
      WHERE id = @id
    `).run({
      id: partId,
      propId
    });

    database.prepare(`
      UPDATE character_decompositions
      SET updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id: candidate.id,
      updatedAt: new Date().toISOString()
    });
  });

  run();
  syncLearningStatuses(database);
  return buildCharacterWorkspace(database, candidate.character_id);
}

export function approveDecompositionCandidate(database: Database.Database, candidateId: string) {
  const candidate = findCandidateRow(database, candidateId);

  if (!candidate) {
    throw new DecompositionCandidateNotFoundError(candidateId);
  }

  if (candidate.status !== "candidate") {
    throw new DecompositionApprovalBlockedError("Only candidate decompositions can be approved.");
  }

  const unresolvedPart = database.prepare(`
    SELECT id
    FROM character_decomposition_parts
    WHERE decomposition_id = ?
      AND prop_id IS NULL
      AND character_id IS NULL
      AND literal_text IS NOT NULL
    LIMIT 1
  `).get(candidateId) as { id: string } | undefined;

  if (unresolvedPart) {
    throw new DecompositionApprovalBlockedError("Resolve all unresolved parts before approving a candidate.");
  }

  const now = new Date().toISOString();
  const run = database.transaction(() => {
    database.prepare(`
      UPDATE character_decompositions
      SET
        status = 'rejected',
        updated_at = @updatedAt
      WHERE character_id = @characterId
        AND id != @candidateId
        AND status != 'rejected'
    `).run({
      characterId: candidate.character_id,
      candidateId,
      updatedAt: now
    });

    database.prepare(`
      UPDATE character_decompositions
      SET
        status = 'approved',
        updated_at = @updatedAt
      WHERE id = @candidateId
    `).run({
      candidateId,
      updatedAt: now
    });
  });

  run();
  syncLearningStatuses(database);
  return buildCharacterWorkspace(database, candidate.character_id);
}
