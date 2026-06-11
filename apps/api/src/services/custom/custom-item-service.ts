import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  ItemSource,
  ItemStatus,
  type CharacterDetailRecord,
  type CustomCharacterCreateInputPayload,
  type CustomWordCreateInputPayload,
  type WordDetailRecord
} from "@hanzi-learning-app/shared";
import { syncLearningStatuses } from "../learning/level-progression-service.js";
import { splitNumberedPinyinSyllable } from "../lexical/pinyin.js";
import { getCharacterDetail, getWordDetail } from "../search/search-service.js";

const customCollectionSourceRef = "extra/custom";

interface ExistingCharacterRow {
  id: string;
}

interface ArchiveableRow {
  id: string;
  learned_at: string | null;
}

export class CustomItemConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomItemConflictError";
  }
}

export class CustomItemNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomItemNotFoundError";
  }
}

export class InvalidCustomItemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCustomItemError";
  }
}

function assertCustomCharacterAvailable(database: Database.Database, hanzi: string) {
  const duplicate = database.prepare(`
    SELECT id
    FROM characters
    WHERE hanzi = ?
  `).get(hanzi) as ExistingCharacterRow | undefined;

  if (duplicate) {
    throw new CustomItemConflictError(`Character ${hanzi} already exists.`);
  }
}

function assertCustomWordAvailable(database: Database.Database, simplified: string) {
  const duplicate = database.prepare(`
    SELECT id
    FROM words
    WHERE simplified = ?
  `).get(simplified) as { id: string } | undefined;

  if (duplicate) {
    throw new CustomItemConflictError(`Word ${simplified} already exists.`);
  }
}

function parseCharacterPinyin(pinyinDisplay: string | null) {
  if (pinyinDisplay == null) {
    return null;
  }

  const split = splitNumberedPinyinSyllable(pinyinDisplay);
  if (split == null) {
    throw new InvalidCustomItemError("Custom character pinyin must be a single numbered syllable such as sen1.");
  }

  return split;
}

function createPlaceholderCharacter(
  database: Database.Database,
  hanzi: string,
  parentWord: string,
  now: string
) {
  const existing = database.prepare(`
    SELECT id
    FROM characters
    WHERE hanzi = ?
  `).get(hanzi) as ExistingCharacterRow | undefined;

  if (existing) {
    return existing.id;
  }

  const id = randomUUID();
  database.prepare(`
    INSERT INTO characters (
      id,
      hanzi,
      status,
      source,
      source_ref,
      notes,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @hanzi,
      @status,
      @source,
      @sourceRef,
      @notes,
      @createdAt,
      @updatedAt
    )
  `).run({
    id,
    hanzi,
    status: ItemStatus.Blocked,
    source: ItemSource.Manual,
    sourceRef: customCollectionSourceRef,
    notes: `Placeholder component created from custom word ${parentWord}.`,
    createdAt: now,
    updatedAt: now
  });

  return id;
}

export function createCustomCharacter(
  database: Database.Database,
  input: CustomCharacterCreateInputPayload
): CharacterDetailRecord {
  assertCustomCharacterAvailable(database, input.hanzi);
  const split = parseCharacterPinyin(input.pinyinDisplay);
  const now = new Date().toISOString();
  const id = randomUUID();

  database.prepare(`
    INSERT INTO characters (
      id,
      hanzi,
      pinyin_display,
      pinyin_source,
      pinyin_source_ref,
      pinyin_initial,
      pinyin_final,
      tone,
      meaning_primary,
      meaning_source,
      meaning_source_ref,
      status,
      blocked_reason,
      learned_at,
      archived_at,
      source,
      source_ref,
      level_id,
      notes,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @hanzi,
      @pinyinDisplay,
      @pinyinSource,
      @pinyinSourceRef,
      @pinyinInitial,
      @pinyinFinal,
      @tone,
      @meaningPrimary,
      @meaningSource,
      @meaningSourceRef,
      @status,
      NULL,
      NULL,
      NULL,
      @source,
      @sourceRef,
      NULL,
      @notes,
      @createdAt,
      @updatedAt
    )
  `).run({
    id,
    hanzi: input.hanzi,
    pinyinDisplay: input.pinyinDisplay,
    pinyinSource: input.pinyinDisplay == null ? null : ItemSource.Manual,
    pinyinSourceRef: input.pinyinDisplay == null ? null : customCollectionSourceRef,
    pinyinInitial: split?.initial ?? null,
    pinyinFinal: split?.final ?? null,
    tone: split?.tone ?? null,
    meaningPrimary: input.meaningPrimary,
    meaningSource: input.meaningPrimary == null ? null : ItemSource.Manual,
    meaningSourceRef: input.meaningPrimary == null ? null : customCollectionSourceRef,
    status: ItemStatus.Blocked,
    source: ItemSource.Manual,
    sourceRef: customCollectionSourceRef,
    notes: input.notes,
    createdAt: now,
    updatedAt: now
  });

  syncLearningStatuses(database);
  return getCharacterDetail(database, id);
}

export function createCustomWord(
  database: Database.Database,
  input: CustomWordCreateInputPayload
): WordDetailRecord {
  assertCustomWordAvailable(database, input.simplified);
  const now = new Date().toISOString();
  const wordId = randomUUID();

  const run = database.transaction(() => {
    database.prepare(`
      INSERT INTO words (
        id,
        simplified,
        pinyin_display,
        pinyin_source,
        pinyin_source_ref,
        meaning_primary,
        meaning_source,
        meaning_source_ref,
        status,
        blocked_reason,
        learned_at,
        archived_at,
        source,
        source_ref,
        level_id,
        notes,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @simplified,
        @pinyinDisplay,
        @pinyinSource,
        @pinyinSourceRef,
        @meaningPrimary,
        @meaningSource,
        @meaningSourceRef,
        @status,
        NULL,
        NULL,
        NULL,
        @source,
        @sourceRef,
        NULL,
        @notes,
        @createdAt,
        @updatedAt
      )
    `).run({
      id: wordId,
      simplified: input.simplified,
      pinyinDisplay: input.pinyinDisplay,
      pinyinSource: input.pinyinDisplay == null ? null : ItemSource.Manual,
      pinyinSourceRef: input.pinyinDisplay == null ? null : customCollectionSourceRef,
      meaningPrimary: input.meaningPrimary,
      meaningSource: input.meaningPrimary == null ? null : ItemSource.Manual,
      meaningSourceRef: input.meaningPrimary == null ? null : customCollectionSourceRef,
      status: ItemStatus.Blocked,
      source: ItemSource.Manual,
      sourceRef: customCollectionSourceRef,
      notes: input.notes,
      createdAt: now,
      updatedAt: now
    });

    const insertComponent = database.prepare(`
      INSERT INTO word_characters (
        word_id,
        character_id,
        sort_order,
        created_at
      )
      VALUES (
        @wordId,
        @characterId,
        @sortOrder,
        @createdAt
      )
    `);

    Array.from(input.simplified).forEach((hanzi, index) => {
      const characterId = createPlaceholderCharacter(database, hanzi, input.simplified, now);
      insertComponent.run({
        wordId,
        characterId,
        sortOrder: index,
        createdAt: now
      });
    });
  });

  run();
  syncLearningStatuses(database);
  return getWordDetail(database, wordId);
}

function archiveItem(
  database: Database.Database,
  tableName: "characters" | "words",
  id: string
) {
  const row = database.prepare(`
    SELECT id, learned_at
    FROM ${tableName}
    WHERE id = ?
  `).get(id) as ArchiveableRow | undefined;

  if (!row) {
    throw new CustomItemNotFoundError(`${tableName.slice(0, -1)} ${id} was not found.`);
  }

  database.prepare(`
    UPDATE ${tableName}
    SET
      status = @status,
      blocked_reason = NULL,
      archived_at = @archivedAt,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id,
    status: ItemStatus.Archived,
    archivedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function restoreItem(
  database: Database.Database,
  tableName: "characters" | "words",
  id: string
) {
  const row = database.prepare(`
    SELECT id, learned_at
    FROM ${tableName}
    WHERE id = ?
  `).get(id) as ArchiveableRow | undefined;

  if (!row) {
    throw new CustomItemNotFoundError(`${tableName.slice(0, -1)} ${id} was not found.`);
  }

  database.prepare(`
    UPDATE ${tableName}
    SET
      status = @status,
      blocked_reason = NULL,
      archived_at = NULL,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id,
    status: row.learned_at == null ? ItemStatus.Blocked : ItemStatus.Learned,
    updatedAt: new Date().toISOString()
  });

  syncLearningStatuses(database);
}

export function archiveCharacter(database: Database.Database, id: string) {
  archiveItem(database, "characters", id);
  return getCharacterDetail(database, id);
}

export function restoreCharacter(database: Database.Database, id: string) {
  restoreItem(database, "characters", id);
  return getCharacterDetail(database, id);
}

export function archiveWord(database: Database.Database, id: string) {
  archiveItem(database, "words", id);
  return getWordDetail(database, id);
}

export function restoreWord(database: Database.Database, id: string) {
  restoreItem(database, "words", id);
  return getWordDetail(database, id);
}
