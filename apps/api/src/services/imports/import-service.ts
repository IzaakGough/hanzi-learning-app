import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  ItemSource,
  ItemStatus,
  type ImportAppliedCounts,
  type ImportDiagnostic,
  type ImportRunSummary,
  type ImportType,
  type KnownCharactersImport,
  type KnownWordsImport,
  type LevelImport,
  type LevelsImport,
  type MappingKind,
  type NormalizedImport,
  type PinyinMappingsImport
} from "@hanzi-learning-app/shared";
import { seedExampleApprovedDecompositions } from "./approved-decomposition-fixture-service.js";
import { seedExampleDecompositionCandidates } from "./decomposition-candidate-fixture-service.js";
import { runLexicalEnrichment } from "./lexical-enrichment-service.js";
import { ensureReviewStatesForLearnedItems } from "../reviews/review-service.js";

interface CharacterRow {
  id: string;
  hanzi: string;
  pinyin_display: string | null;
  pinyin_source: ItemSource | null;
  pinyin_source_ref: string | null;
  pinyin_initial: string | null;
  pinyin_final: string | null;
  tone: string | null;
  meaning_primary: string | null;
  meaning_source: ItemSource | null;
  meaning_source_ref: string | null;
  meanings_other_json: string | null;
  status: ItemStatus;
  blocked_reason: string | null;
  learned_at: string | null;
  archived_at: string | null;
  source: ItemSource;
  source_ref: string | null;
  level_id: string | null;
  notes: string | null;
}

interface WordRow {
  id: string;
  simplified: string;
  pinyin_display: string | null;
  pinyin_source: ItemSource | null;
  pinyin_source_ref: string | null;
  meaning_primary: string | null;
  meaning_source: ItemSource | null;
  meaning_source_ref: string | null;
  meanings_other_json: string | null;
  status: ItemStatus;
  blocked_reason: string | null;
  learned_at: string | null;
  archived_at: string | null;
  source: ItemSource;
  source_ref: string | null;
  level_id: string | null;
  notes: string | null;
}

interface LevelRow {
  id: string;
  course: string;
  sequence_number: number;
  title: string | null;
  notes: string | null;
}

interface PinyinMappingRow {
  id: string;
  kind: MappingKind;
  symbol: string;
  mapped_value: string;
  notes: string | null;
}

interface ImportRunContext {
  database: Database.Database;
  importId: string;
  diagnostics: ImportDiagnostic[];
  appliedCounts: ImportAppliedCounts;
  now: string;
}

class ImportServiceError extends Error {
  constructor(
    message: string,
    readonly diagnostics: ImportDiagnostic[] = []
  ) {
    super(message);
    this.name = "ImportServiceError";
  }
}

const emptyAppliedCounts = (): ImportAppliedCounts => ({
  created: 0,
  updated: 0,
  linked: 0,
  placeholdersCreated: 0
});

function isBlank(value: string | null | undefined) {
  return value == null || value.trim().length === 0;
}

function toSummary(
  importId: string,
  payload: NormalizedImport,
  status: "completed" | "failed",
  diagnostics: ImportDiagnostic[],
  appliedCounts: ImportAppliedCounts
): ImportRunSummary {
  return {
    importId,
    importType: payload.importType,
    sourceName: payload.sourceName,
    sourceRef: null,
    status,
    diagnostics,
    appliedCounts
  };
}

function addDiagnostic(context: ImportRunContext, diagnostic: ImportDiagnostic) {
  context.diagnostics.push(diagnostic);
}

function failIfErrors(context: ImportRunContext, importType: ImportType) {
  const errors = context.diagnostics.filter((diagnostic) => diagnostic.severity === "error");

  if (errors.length === 0) {
    return;
  }

  throw new ImportServiceError(`Import failed for ${importType}`, errors);
}

function findCharacterByHanzi(database: Database.Database, hanzi: string) {
  return database
    .prepare("SELECT * FROM characters WHERE hanzi = ?")
    .get(hanzi) as CharacterRow | undefined;
}

function findWordBySimplified(database: Database.Database, simplified: string) {
  return database
    .prepare("SELECT * FROM words WHERE simplified = ?")
    .get(simplified) as WordRow | undefined;
}

function findLevelByCourseAndSequence(database: Database.Database, course: string, sequenceNumber: number) {
  return database
    .prepare("SELECT * FROM levels WHERE course = ? AND sequence_number = ?")
    .get(course, sequenceNumber) as LevelRow | undefined;
}

function findPinyinMapping(database: Database.Database, kind: MappingKind, symbol: string) {
  return database
    .prepare("SELECT * FROM pinyin_mappings WHERE kind = ? AND symbol = ?")
    .get(kind, symbol) as PinyinMappingRow | undefined;
}

function ensurePlaceholderCharacter(
  context: ImportRunContext,
  hanzi: string,
  source: ItemSource,
  sourceRef: string | undefined
) {
  const existing = findCharacterByHanzi(context.database, hanzi);

  if (existing) {
    return existing;
  }

  const id = randomUUID();

  context.database.prepare(`
    INSERT INTO characters (
      id,
      hanzi,
      status,
      source,
      source_ref,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @hanzi,
      @status,
      @source,
      @sourceRef,
      @createdAt,
      @updatedAt
    )
  `).run({
    id,
    hanzi,
    status: ItemStatus.Blocked,
    source,
    sourceRef: sourceRef ?? null,
    createdAt: context.now,
    updatedAt: context.now
  });

  context.appliedCounts.created += 1;
  context.appliedCounts.placeholdersCreated += 1;

  return findCharacterByHanzi(context.database, hanzi)!;
}

function ensurePlaceholderWord(
  context: ImportRunContext,
  simplified: string,
  source: ItemSource,
  sourceRef: string | undefined
) {
  const existing = findWordBySimplified(context.database, simplified);

  if (existing) {
    return existing;
  }

  const id = randomUUID();

  context.database.prepare(`
    INSERT INTO words (
      id,
      simplified,
      status,
      source,
      source_ref,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @simplified,
      @status,
      @source,
      @sourceRef,
      @createdAt,
      @updatedAt
    )
  `).run({
    id,
    simplified,
    status: ItemStatus.Blocked,
    source,
    sourceRef: sourceRef ?? null,
    createdAt: context.now,
    updatedAt: context.now
  });

  context.appliedCounts.created += 1;
  context.appliedCounts.placeholdersCreated += 1;

  return findWordBySimplified(context.database, simplified)!;
}

function applyTextFieldUpdate<TExisting extends CharacterRow | WordRow | LevelRow | PinyinMappingRow>(
  context: ImportRunContext,
  params: {
    existingValue: string | null;
    incomingValue: string | undefined;
    entityType: ImportDiagnostic["entityType"];
    entityKey: string;
    field: string;
    conflictCode: string;
  }
) {
  const { existingValue, incomingValue, entityType, entityKey, field, conflictCode } = params;

  if (isBlank(incomingValue)) {
    return existingValue;
  }

  if (isBlank(existingValue)) {
    return incomingValue!;
  }

  if (existingValue !== incomingValue) {
    addDiagnostic(context, {
      severity: "warning",
      code: conflictCode,
      message: `Incoming ${field} for ${entityKey} differs from stored value and was not overwritten.`,
      entityType,
      entityKey,
      field
    });
  }

  return existingValue;
}

function applyLexicalFieldUpdate(
  context: ImportRunContext,
  params: {
    existingValue: string | null;
    existingSource: ItemSource | null;
    existingSourceRef: string | null;
    incomingValue: string | undefined;
    incomingSource: ItemSource;
    incomingSourceRef: string | undefined;
    entityType: ImportDiagnostic["entityType"];
    entityKey: string;
    field: string;
    conflictCode: string;
  }
) {
  const {
    existingValue,
    existingSource,
    existingSourceRef,
    incomingValue,
    incomingSource,
    incomingSourceRef,
    entityType,
    entityKey,
    field,
    conflictCode
  } = params;

  if (isBlank(incomingValue)) {
    return {
      value: existingValue,
      source: isBlank(existingValue) ? existingSource : (existingSource ?? incomingSource),
      sourceRef: isBlank(existingValue) ? existingSourceRef : (existingSourceRef ?? incomingSourceRef ?? null)
    };
  }

  if (isBlank(existingValue)) {
    return {
      value: incomingValue!,
      source: incomingSource,
      sourceRef: incomingSourceRef ?? null
    };
  }

  if (existingValue !== incomingValue) {
    addDiagnostic(context, {
      severity: "warning",
      code: conflictCode,
      message: `Incoming ${field} for ${entityKey} differs from stored value and was not overwritten.`,
      entityType,
      entityKey,
      field
    });
  }

  return {
    value: existingValue,
    source: existingSource ?? incomingSource,
    sourceRef: existingSourceRef ?? incomingSourceRef ?? null
  };
}

function upsertKnownCharacters(context: ImportRunContext, payload: KnownCharactersImport) {
  for (const item of payload.items) {
    const existing = findCharacterByHanzi(context.database, item.hanzi);

    if (!existing) {
      context.database.prepare(`
        INSERT INTO characters (
          id,
          hanzi,
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
          @meaningPrimary,
          @meaningSource,
          @meaningSourceRef,
          @status,
          NULL,
          @learnedAt,
          NULL,
          @source,
          @sourceRef,
          @notes,
          @createdAt,
          @updatedAt
        )
      `).run({
        id: randomUUID(),
        hanzi: item.hanzi,
        pinyinDisplay: item.pinyinDisplay ?? null,
        pinyinSource: item.pinyinDisplay ? item.source : null,
        pinyinSourceRef: item.pinyinDisplay ? (item.sourceRef ?? null) : null,
        meaningPrimary: item.meaningPrimary ?? null,
        meaningSource: item.meaningPrimary ? item.source : null,
        meaningSourceRef: item.meaningPrimary ? (item.sourceRef ?? null) : null,
        status: ItemStatus.Learned,
        learnedAt: context.now,
        source: item.source,
        sourceRef: item.sourceRef ?? null,
        notes: item.notes ?? null,
        createdAt: context.now,
        updatedAt: context.now
      });

      context.appliedCounts.created += 1;
      continue;
    }

    const nextPinyin = applyLexicalFieldUpdate(context, {
      existingValue: existing.pinyin_display,
      existingSource: existing.pinyin_source,
      existingSourceRef: existing.pinyin_source_ref,
      incomingValue: item.pinyinDisplay,
      incomingSource: item.source,
      incomingSourceRef: item.sourceRef,
      entityType: "character",
      entityKey: item.hanzi,
      field: "pinyinDisplay",
      conflictCode: "character_field_conflict"
    });

    const nextMeaning = applyLexicalFieldUpdate(context, {
      existingValue: existing.meaning_primary,
      existingSource: existing.meaning_source,
      existingSourceRef: existing.meaning_source_ref,
      incomingValue: item.meaningPrimary,
      incomingSource: item.source,
      incomingSourceRef: item.sourceRef,
      entityType: "character",
      entityKey: item.hanzi,
      field: "meaningPrimary",
      conflictCode: "character_field_conflict"
    });

    const nextSourceRef = applyTextFieldUpdate(context, {
      existingValue: existing.source_ref,
      incomingValue: item.sourceRef,
      entityType: "character",
      entityKey: item.hanzi,
      field: "sourceRef",
      conflictCode: "character_field_conflict"
    });

    const nextNotes = applyTextFieldUpdate(context, {
      existingValue: existing.notes,
      incomingValue: item.notes,
      entityType: "character",
      entityKey: item.hanzi,
      field: "notes",
      conflictCode: "character_field_conflict"
    });

    const nextStatus = ItemStatus.Learned;
    const nextLearnedAt = existing.learned_at ?? context.now;

    const shouldUpdate =
      nextPinyin.value !== existing.pinyin_display ||
      nextPinyin.source !== existing.pinyin_source ||
      nextPinyin.sourceRef !== existing.pinyin_source_ref ||
      nextMeaning.value !== existing.meaning_primary ||
      nextMeaning.source !== existing.meaning_source ||
      nextMeaning.sourceRef !== existing.meaning_source_ref ||
      nextSourceRef !== existing.source_ref ||
      nextNotes !== existing.notes ||
      nextStatus !== existing.status ||
      nextLearnedAt !== existing.learned_at ||
      existing.blocked_reason !== null ||
      existing.archived_at !== null;

    if (!shouldUpdate) {
      continue;
    }

    context.database.prepare(`
      UPDATE characters
      SET
        pinyin_display = @pinyinDisplay,
        pinyin_source = @pinyinSource,
        pinyin_source_ref = @pinyinSourceRef,
        meaning_primary = @meaningPrimary,
        meaning_source = @meaningSource,
        meaning_source_ref = @meaningSourceRef,
        status = @status,
        blocked_reason = NULL,
        learned_at = @learnedAt,
        archived_at = NULL,
        source_ref = @sourceRef,
        notes = @notes,
        updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id: existing.id,
      pinyinDisplay: nextPinyin.value,
      pinyinSource: nextPinyin.source,
      pinyinSourceRef: nextPinyin.sourceRef,
      meaningPrimary: nextMeaning.value,
      meaningSource: nextMeaning.source,
      meaningSourceRef: nextMeaning.sourceRef,
      status: nextStatus,
      learnedAt: nextLearnedAt,
      sourceRef: nextSourceRef,
      notes: nextNotes,
      updatedAt: context.now
    });

    context.appliedCounts.updated += 1;
  }
}

function syncWordCharacters(
  context: ImportRunContext,
  wordId: string,
  simplified: string,
  placeholderSource: ItemSource,
  sourceRef: string | undefined
) {
  const existingRows = context.database.prepare(`
    SELECT wc.sort_order, c.hanzi
    FROM word_characters wc
    INNER JOIN characters c ON c.id = wc.character_id
    WHERE wc.word_id = ?
    ORDER BY wc.sort_order ASC
  `).all(wordId) as Array<{ sort_order: number; hanzi: string }>;

  const incomingHanzi = Array.from(simplified);
  const existingHanzi = existingRows.map((row) => row.hanzi);

  if (existingRows.length > 0 && existingHanzi.join("") !== incomingHanzi.join("")) {
    addDiagnostic(context, {
      severity: "warning",
      code: "word_character_link_conflict",
      message: `Stored character links for ${simplified} differ from the canonical simplified text and were left unchanged.`,
      entityType: "word",
      entityKey: simplified,
      field: "wordCharacters"
    });
    return;
  }

  if (existingRows.length > 0) {
    return;
  }

  const insertWordCharacter = context.database.prepare(`
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

  incomingHanzi.forEach((hanzi, index) => {
    const character = ensurePlaceholderCharacter(context, hanzi, placeholderSource, sourceRef);

    insertWordCharacter.run({
      wordId,
      characterId: character.id,
      sortOrder: index,
      createdAt: context.now
    });

    context.appliedCounts.linked += 1;
  });
}

function upsertKnownWords(context: ImportRunContext, payload: KnownWordsImport) {
  for (const item of payload.items) {
    const existing = findWordBySimplified(context.database, item.simplified);

    if (!existing) {
      const wordId = randomUUID();

      context.database.prepare(`
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
          @learnedAt,
          NULL,
          @source,
          @sourceRef,
          @notes,
          @createdAt,
          @updatedAt
        )
      `).run({
        id: wordId,
        simplified: item.simplified,
        pinyinDisplay: item.pinyinDisplay ?? null,
        pinyinSource: item.pinyinDisplay ? item.source : null,
        pinyinSourceRef: item.pinyinDisplay ? (item.sourceRef ?? null) : null,
        meaningPrimary: item.meaningPrimary ?? null,
        meaningSource: item.meaningPrimary ? item.source : null,
        meaningSourceRef: item.meaningPrimary ? (item.sourceRef ?? null) : null,
        status: ItemStatus.Learned,
        learnedAt: context.now,
        source: item.source,
        sourceRef: item.sourceRef ?? null,
        notes: item.notes ?? null,
        createdAt: context.now,
        updatedAt: context.now
      });

      context.appliedCounts.created += 1;
      syncWordCharacters(context, wordId, item.simplified, item.source, item.sourceRef);
      continue;
    }

    const nextPinyin = applyLexicalFieldUpdate(context, {
      existingValue: existing.pinyin_display,
      existingSource: existing.pinyin_source,
      existingSourceRef: existing.pinyin_source_ref,
      incomingValue: item.pinyinDisplay,
      incomingSource: item.source,
      incomingSourceRef: item.sourceRef,
      entityType: "word",
      entityKey: item.simplified,
      field: "pinyinDisplay",
      conflictCode: "word_field_conflict"
    });

    const nextMeaning = applyLexicalFieldUpdate(context, {
      existingValue: existing.meaning_primary,
      existingSource: existing.meaning_source,
      existingSourceRef: existing.meaning_source_ref,
      incomingValue: item.meaningPrimary,
      incomingSource: item.source,
      incomingSourceRef: item.sourceRef,
      entityType: "word",
      entityKey: item.simplified,
      field: "meaningPrimary",
      conflictCode: "word_field_conflict"
    });

    const nextSourceRef = applyTextFieldUpdate(context, {
      existingValue: existing.source_ref,
      incomingValue: item.sourceRef,
      entityType: "word",
      entityKey: item.simplified,
      field: "sourceRef",
      conflictCode: "word_field_conflict"
    });

    const nextNotes = applyTextFieldUpdate(context, {
      existingValue: existing.notes,
      incomingValue: item.notes,
      entityType: "word",
      entityKey: item.simplified,
      field: "notes",
      conflictCode: "word_field_conflict"
    });

    const nextStatus = ItemStatus.Learned;
    const nextLearnedAt = existing.learned_at ?? context.now;

    const shouldUpdate =
      nextPinyin.value !== existing.pinyin_display ||
      nextPinyin.source !== existing.pinyin_source ||
      nextPinyin.sourceRef !== existing.pinyin_source_ref ||
      nextMeaning.value !== existing.meaning_primary ||
      nextMeaning.source !== existing.meaning_source ||
      nextMeaning.sourceRef !== existing.meaning_source_ref ||
      nextSourceRef !== existing.source_ref ||
      nextNotes !== existing.notes ||
      nextStatus !== existing.status ||
      nextLearnedAt !== existing.learned_at ||
      existing.blocked_reason !== null ||
      existing.archived_at !== null;

    if (shouldUpdate) {
      context.database.prepare(`
        UPDATE words
        SET
          pinyin_display = @pinyinDisplay,
          pinyin_source = @pinyinSource,
          pinyin_source_ref = @pinyinSourceRef,
          meaning_primary = @meaningPrimary,
          meaning_source = @meaningSource,
          meaning_source_ref = @meaningSourceRef,
          status = @status,
          blocked_reason = NULL,
          learned_at = @learnedAt,
          archived_at = NULL,
          source_ref = @sourceRef,
          notes = @notes,
          updated_at = @updatedAt
        WHERE id = @id
      `).run({
        id: existing.id,
        pinyinDisplay: nextPinyin.value,
        pinyinSource: nextPinyin.source,
        pinyinSourceRef: nextPinyin.sourceRef,
        meaningPrimary: nextMeaning.value,
        meaningSource: nextMeaning.source,
        meaningSourceRef: nextMeaning.sourceRef,
        status: nextStatus,
        learnedAt: nextLearnedAt,
        sourceRef: nextSourceRef,
        notes: nextNotes,
        updatedAt: context.now
      });

      context.appliedCounts.updated += 1;
    }

    syncWordCharacters(context, existing.id, item.simplified, item.source, item.sourceRef);
  }
}

function ensureLevel(context: ImportRunContext, item: LevelImport) {
  const existing = findLevelByCourseAndSequence(context.database, item.course, item.sequenceNumber);

  if (!existing) {
    const levelId = randomUUID();

    context.database.prepare(`
      INSERT INTO levels (
        id,
        course,
        sequence_number,
        title,
        notes,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @course,
        @sequenceNumber,
        @title,
        @notes,
        @createdAt,
        @updatedAt
      )
    `).run({
      id: levelId,
      course: item.course,
      sequenceNumber: item.sequenceNumber,
      title: item.title ?? null,
      notes: item.notes ?? null,
      createdAt: context.now,
      updatedAt: context.now
    });

    context.appliedCounts.created += 1;
    return findLevelByCourseAndSequence(context.database, item.course, item.sequenceNumber)!;
  }

  const nextTitle = applyTextFieldUpdate(context, {
    existingValue: existing.title,
    incomingValue: item.title,
    entityType: "level",
    entityKey: `${item.course}:${item.sequenceNumber}`,
    field: "title",
    conflictCode: "level_field_conflict"
  });

  const nextNotes = applyTextFieldUpdate(context, {
    existingValue: existing.notes,
    incomingValue: item.notes,
    entityType: "level",
    entityKey: `${item.course}:${item.sequenceNumber}`,
    field: "notes",
    conflictCode: "level_field_conflict"
  });

  if (nextTitle === existing.title && nextNotes === existing.notes) {
    return existing;
  }

  context.database.prepare(`
    UPDATE levels
    SET
      title = @title,
      notes = @notes,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id: existing.id,
    title: nextTitle,
    notes: nextNotes,
    updatedAt: context.now
  });

  context.appliedCounts.updated += 1;

  return findLevelByCourseAndSequence(context.database, item.course, item.sequenceNumber)!;
}

function ensureFirstIntroduction(
  context: ImportRunContext,
  params: {
    tableName: "characters" | "words";
    id: string;
    existingLevelId: string | null;
    levelId: string;
    entityType: "character" | "word";
    entityKey: string;
  }
) {
  const { tableName, id, existingLevelId, levelId, entityType, entityKey } = params;

  if (existingLevelId === null) {
    context.database.prepare(`
      UPDATE ${tableName}
      SET level_id = @levelId, updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id,
      levelId,
      updatedAt: context.now
    });

    context.appliedCounts.updated += 1;
    return;
  }

  if (existingLevelId !== levelId) {
    addDiagnostic(context, {
      severity: "warning",
      code: entityType === "word"
        ? "duplicate_level_word_introduction"
        : "duplicate_level_character_introduction",
      message: `${entityKey} is already introduced in another level.`,
      entityType,
      entityKey,
      field: "levelId"
    });
  }
}

function syncLevelCharacters(context: ImportRunContext, levelId: string, level: LevelImport) {
  const insertLevelCharacter = context.database.prepare(`
    INSERT INTO level_characters (
      level_id,
      character_id,
      sort_order,
      created_at
    )
    VALUES (
      @levelId,
      @characterId,
      @sortOrder,
      @createdAt
    )
  `);

  const characterIds: string[] = [];

  level.characters.forEach((item) => {
    const character = ensurePlaceholderCharacter(
      context,
      item.hanzi,
      ItemSource.CurriculumImport,
      level.course
    );

    ensureFirstIntroduction(context, {
      tableName: "characters",
      id: character.id,
      existingLevelId: character.level_id,
      levelId,
      entityType: "character",
      entityKey: item.hanzi
    });

    characterIds.push(character.id);
  });

  context.database.prepare("DELETE FROM level_characters WHERE level_id = ?").run(levelId);

  characterIds.forEach((characterId, index) => {
    insertLevelCharacter.run({
      levelId,
      characterId,
      sortOrder: index,
      createdAt: context.now
    });

    context.appliedCounts.linked += 1;
  });
}

function syncLevelWords(context: ImportRunContext, levelId: string, level: LevelImport) {
  const insertLevelWord = context.database.prepare(`
    INSERT INTO level_words (
      level_id,
      word_id,
      sort_order,
      created_at
    )
    VALUES (
      @levelId,
      @wordId,
      @sortOrder,
      @createdAt
    )
  `);

  const wordIds: string[] = [];

  level.words.forEach((item) => {
    const word = ensurePlaceholderWord(
      context,
      item.simplified,
      ItemSource.CurriculumImport,
      level.course
    );

    ensureFirstIntroduction(context, {
      tableName: "words",
      id: word.id,
      existingLevelId: word.level_id,
      levelId,
      entityType: "word",
      entityKey: item.simplified
    });

    syncWordCharacters(
      context,
      word.id,
      item.simplified,
      ItemSource.CurriculumImport,
      level.course
    );

    wordIds.push(word.id);
  });

  context.database.prepare("DELETE FROM level_words WHERE level_id = ?").run(levelId);

  wordIds.forEach((wordId, index) => {
    insertLevelWord.run({
      levelId,
      wordId,
      sortOrder: index,
      createdAt: context.now
    });

    context.appliedCounts.linked += 1;
  });
}

function upsertLevels(context: ImportRunContext, payload: LevelsImport) {
  for (const level of payload.items) {
    const levelRow = ensureLevel(context, level);
    syncLevelCharacters(context, levelRow.id, level);
    syncLevelWords(context, levelRow.id, level);
  }
}

function upsertPinyinMappings(context: ImportRunContext, payload: PinyinMappingsImport) {
  for (const item of payload.items) {
    const existing = findPinyinMapping(context.database, item.kind, item.symbol);

    if (!existing) {
      context.database.prepare(`
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
        id: randomUUID(),
        kind: item.kind,
        symbol: item.symbol,
        mappedValue: item.mappedValue,
        notes: item.notes ?? null,
        createdAt: context.now,
        updatedAt: context.now
      });

      context.appliedCounts.created += 1;
      continue;
    }

    const nextMappedValue = applyTextFieldUpdate(context, {
      existingValue: existing.mapped_value,
      incomingValue: item.mappedValue,
      entityType: "mapping",
      entityKey: `${item.kind}:${item.symbol}`,
      field: "mappedValue",
      conflictCode: "mapping_value_conflict"
    });

    const nextNotes = applyTextFieldUpdate(context, {
      existingValue: existing.notes,
      incomingValue: item.notes,
      entityType: "mapping",
      entityKey: `${item.kind}:${item.symbol}`,
      field: "notes",
      conflictCode: "mapping_value_conflict"
    });

    if (nextMappedValue === existing.mapped_value && nextNotes === existing.notes) {
      continue;
    }

    context.database.prepare(`
      UPDATE pinyin_mappings
      SET
        mapped_value = @mappedValue,
        notes = @notes,
        updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id: existing.id,
      mappedValue: nextMappedValue,
      notes: nextNotes,
      updatedAt: context.now
    });

    context.appliedCounts.updated += 1;
  }
}

function applyImport(context: ImportRunContext, payload: NormalizedImport) {
  switch (payload.importType) {
    case "known_characters":
      upsertKnownCharacters(context, payload);
      return;
    case "known_words":
      upsertKnownWords(context, payload);
      return;
    case "levels":
      upsertLevels(context, payload);
      return;
    case "pinyin_mappings":
      upsertPinyinMappings(context, payload);
      return;
  }
}

function applyLexicalEnrichment(context: ImportRunContext) {
  const result = runLexicalEnrichment(context.database);
  context.diagnostics.push(...result.diagnostics);
  context.appliedCounts.updated += result.updatedCount;
}

function applyExampleApprovedDecompositions(context: ImportRunContext) {
  seedExampleApprovedDecompositions(context.database);
}

function applyExampleDecompositionCandidates(context: ImportRunContext) {
  seedExampleDecompositionCandidates(context.database);
}

function applyReviewStateSeeding(context: ImportRunContext) {
  ensureReviewStatesForLearnedItems(context.database);
}

export function runNormalizedImport(
  database: Database.Database,
  payload: NormalizedImport
): ImportRunSummary {
  const importId = randomUUID();
  const context: ImportRunContext = {
    database,
    importId,
    diagnostics: [],
    appliedCounts: emptyAppliedCounts(),
    now: new Date().toISOString()
  };

  database.prepare(`
    INSERT INTO imports (
      id,
      import_type,
      source_name,
      source_ref,
      status,
      summary_json,
      error_message,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @importType,
      @sourceName,
      NULL,
      'started',
      NULL,
      NULL,
      @createdAt,
      @updatedAt
    )
  `).run({
    id: importId,
    importType: payload.importType,
    sourceName: payload.sourceName,
    createdAt: context.now,
    updatedAt: context.now
  });

  const executeImport = database.transaction(() => {
    applyImport(context, payload);
    applyLexicalEnrichment(context);
    applyExampleApprovedDecompositions(context);
    applyExampleDecompositionCandidates(context);
    applyReviewStateSeeding(context);
    failIfErrors(context, payload.importType);
  });

  try {
    executeImport();
    const summary = toSummary(
      context.importId,
      payload,
      "completed",
      context.diagnostics,
      context.appliedCounts
    );

    database.prepare(`
      UPDATE imports
      SET
        status = 'completed',
        summary_json = @summaryJson,
        error_message = NULL,
        updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id: importId,
      summaryJson: JSON.stringify(summary),
      updatedAt: new Date().toISOString()
    });

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown import error";
    const diagnostics = error instanceof ImportServiceError
      ? context.diagnostics
      : [
          ...context.diagnostics,
          {
            severity: "error" as const,
            code: "unexpected_import_error",
            message,
            entityType: "import" as const,
            entityKey: payload.importType
          }
        ];

    const summary = toSummary(
      context.importId,
      payload,
      "failed",
      diagnostics,
      context.appliedCounts
    );

    database.prepare(`
      UPDATE imports
      SET
        status = 'failed',
        summary_json = @summaryJson,
        error_message = @errorMessage,
        updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id: importId,
      summaryJson: JSON.stringify(summary),
      errorMessage: message,
      updatedAt: new Date().toISOString()
    });

    return summary;
  }
}
