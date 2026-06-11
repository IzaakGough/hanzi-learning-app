import type Database from "better-sqlite3";
import {
  ItemStatus,
  type CurrentLevelProgressResponse,
  type LearningBlockReason,
  type LearningCharacterState,
  type LearningLevelState,
  type LearningWordState
} from "@hanzi-learning-app/shared";

interface LevelRow {
  id: string;
  course: string;
  sequence_number: number;
  title: string | null;
}

interface CharacterRow {
  id: string;
  hanzi: string;
  pinyin_display: string | null;
  pinyin_initial: string | null;
  pinyin_final: string | null;
  tone: string | null;
  meaning_primary: string | null;
  status: ItemStatus;
  learned_at: string | null;
  blocked_reason: string | null;
}

interface WordRow {
  id: string;
  simplified: string;
  pinyin_display: string | null;
  meaning_primary: string | null;
  status: ItemStatus;
  learned_at: string | null;
  blocked_reason: string | null;
}

interface WordComponentRow {
  id: string;
  hanzi: string;
  status: ItemStatus;
}

export class LearningItemNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LearningItemNotFoundError";
  }
}

export class LearningItemNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LearningItemNotReadyError";
  }
}

function isBlank(value: string | null | undefined) {
  return value == null || value.trim().length === 0;
}

function hasApprovedDecomposition(database: Database.Database, characterId: string) {
  const row = database.prepare(`
    SELECT id
    FROM character_decompositions
    WHERE character_id = ? AND status = 'approved'
    LIMIT 1
  `).get(characterId) as { id: string } | undefined;

  return Boolean(row);
}

function syncCharacterStatuses(database: Database.Database) {
  const rows = database.prepare(`
    SELECT
      id,
      hanzi,
      pinyin_display,
      pinyin_initial,
      pinyin_final,
      tone,
      meaning_primary,
      status,
      learned_at,
      blocked_reason
    FROM characters
    WHERE archived_at IS NULL
  `).all() as CharacterRow[];

  const update = database.prepare(`
    UPDATE characters
    SET status = @status, blocked_reason = @blockedReason, updated_at = @updatedAt
    WHERE id = @id
  `);
  const now = new Date().toISOString();

  for (const row of rows) {
    if (row.status === ItemStatus.Learned) {
      if (row.blocked_reason !== null) {
        update.run({
          id: row.id,
          status: row.status,
          blockedReason: null,
          updatedAt: now
        });
      }

      continue;
    }

    const blockedReasons: LearningBlockReason[] = [];

    if (isBlank(row.hanzi)) {
      blockedReasons.push("missing_text");
    }

    if (isBlank(row.pinyin_display)) {
      blockedReasons.push("missing_pinyin");
    }

    if (isBlank(row.pinyin_initial) || isBlank(row.pinyin_final) || isBlank(row.tone)) {
      blockedReasons.push("missing_pinyin_split");
    }

    if (isBlank(row.meaning_primary)) {
      blockedReasons.push("missing_primary_meaning");
    }

    if (!hasApprovedDecomposition(database, row.id)) {
      blockedReasons.push("missing_approved_decomposition");
    }

    const nextStatus = blockedReasons.length === 0 ? ItemStatus.Ready : ItemStatus.Blocked;
    const nextBlockedReason = blockedReasons[0] ?? null;

    if (nextStatus !== row.status || nextBlockedReason !== row.blocked_reason) {
      update.run({
        id: row.id,
        status: nextStatus,
        blockedReason: nextBlockedReason,
        updatedAt: now
      });
    }
  }
}

function getWordComponentRows(database: Database.Database, wordId: string) {
  return database.prepare(`
    SELECT c.id, c.hanzi, c.status
    FROM word_characters wc
    INNER JOIN characters c ON c.id = wc.character_id
    WHERE wc.word_id = ?
    ORDER BY wc.sort_order ASC
  `).all(wordId) as WordComponentRow[];
}

function syncWordStatuses(database: Database.Database) {
  const rows = database.prepare(`
    SELECT
      id,
      simplified,
      pinyin_display,
      meaning_primary,
      status,
      learned_at,
      blocked_reason
    FROM words
    WHERE archived_at IS NULL
  `).all() as WordRow[];

  const update = database.prepare(`
    UPDATE words
    SET status = @status, blocked_reason = @blockedReason, updated_at = @updatedAt
    WHERE id = @id
  `);
  const now = new Date().toISOString();

  for (const row of rows) {
    if (row.status === ItemStatus.Learned) {
      if (row.blocked_reason !== null) {
        update.run({
          id: row.id,
          status: row.status,
          blockedReason: null,
          updatedAt: now
        });
      }

      continue;
    }

    const blockedReasons: LearningBlockReason[] = [];

    if (isBlank(row.simplified)) {
      blockedReasons.push("missing_text");
    }

    if (isBlank(row.pinyin_display)) {
      blockedReasons.push("missing_pinyin");
    }

    if (isBlank(row.meaning_primary)) {
      blockedReasons.push("missing_primary_meaning");
    }

    const components = getWordComponentRows(database, row.id);

    if (components.some((component) => component.status !== ItemStatus.Learned)) {
      blockedReasons.push("component_characters_unlearned");
    }

    const nextStatus = blockedReasons.length === 0 ? ItemStatus.Ready : ItemStatus.Blocked;
    const nextBlockedReason = blockedReasons[0] ?? null;

    if (nextStatus !== row.status || nextBlockedReason !== row.blocked_reason) {
      update.run({
        id: row.id,
        status: nextStatus,
        blockedReason: nextBlockedReason,
        updatedAt: now
      });
    }
  }
}

export function syncLearningStatuses(database: Database.Database) {
  syncCharacterStatuses(database);
  syncWordStatuses(database);
}

function loadLearningCharacters(database: Database.Database, levelId: string): LearningCharacterState[] {
  const rows = database.prepare(`
    SELECT
      c.id,
      c.hanzi,
      c.pinyin_display,
      c.pinyin_initial,
      c.pinyin_final,
      c.tone,
      c.meaning_primary,
      c.status,
      c.learned_at
    FROM level_characters lc
    INNER JOIN characters c ON c.id = lc.character_id
    WHERE lc.level_id = ?
    ORDER BY lc.sort_order ASC
  `).all(levelId) as CharacterRow[];

  return rows.map((row) => {
    const blockedReasons: LearningBlockReason[] = [];
    const decompositionReady = hasApprovedDecomposition(database, row.id);

    if (isBlank(row.hanzi)) {
      blockedReasons.push("missing_text");
    }

    if (isBlank(row.pinyin_display)) {
      blockedReasons.push("missing_pinyin");
    }

    if (isBlank(row.pinyin_initial) || isBlank(row.pinyin_final) || isBlank(row.tone)) {
      blockedReasons.push("missing_pinyin_split");
    }

    if (isBlank(row.meaning_primary)) {
      blockedReasons.push("missing_primary_meaning");
    }

    if (!decompositionReady) {
      blockedReasons.push("missing_approved_decomposition");
    }

    return {
      id: row.id,
      hanzi: row.hanzi,
      pinyinDisplay: row.pinyin_display,
      pinyinInitial: row.pinyin_initial,
      pinyinFinal: row.pinyin_final,
      tone: row.tone,
      meaningPrimary: row.meaning_primary,
      status: row.status,
      learnedAt: row.learned_at,
      isLearnable: row.status === ItemStatus.Ready,
      blockedReasons,
      hasApprovedDecomposition: decompositionReady
    };
  });
}

function loadLearningWords(database: Database.Database, levelId: string): LearningWordState[] {
  const rows = database.prepare(`
    SELECT
      w.id,
      w.simplified,
      w.pinyin_display,
      w.meaning_primary,
      w.status,
      w.learned_at
    FROM level_words lw
    INNER JOIN words w ON w.id = lw.word_id
    WHERE lw.level_id = ?
    ORDER BY lw.sort_order ASC
  `).all(levelId) as WordRow[];

  return rows.map((row) => {
    const blockedReasons: LearningBlockReason[] = [];
    const componentCharacters = getWordComponentRows(database, row.id);

    if (isBlank(row.simplified)) {
      blockedReasons.push("missing_text");
    }

    if (isBlank(row.pinyin_display)) {
      blockedReasons.push("missing_pinyin");
    }

    if (isBlank(row.meaning_primary)) {
      blockedReasons.push("missing_primary_meaning");
    }

    if (componentCharacters.some((component) => component.status !== ItemStatus.Learned)) {
      blockedReasons.push("component_characters_unlearned");
    }

    return {
      id: row.id,
      simplified: row.simplified,
      pinyinDisplay: row.pinyin_display,
      meaningPrimary: row.meaning_primary,
      status: row.status,
      learnedAt: row.learned_at,
      isLearnable: row.status === ItemStatus.Ready,
      blockedReasons,
      componentCharacters: componentCharacters.map((component) => ({
        id: component.id,
        hanzi: component.hanzi,
        status: component.status
      }))
    };
  });
}

function buildLevelState(database: Database.Database, level: LevelRow): LearningLevelState {
  const characters = loadLearningCharacters(database, level.id);
  const words = loadLearningWords(database, level.id);

  return {
    id: level.id,
    course: level.course,
    sequenceNumber: level.sequence_number,
    title: level.title,
    isComplete: [...characters, ...words].every((item) => item.status === ItemStatus.Learned),
    nextCharacterId: characters.find((character) => character.status !== ItemStatus.Learned)?.id ?? null,
    characters,
    words
  };
}

export function getCurrentLevelProgress(database: Database.Database): CurrentLevelProgressResponse {
  syncLearningStatuses(database);

  const levels = database.prepare(`
    SELECT id, course, sequence_number, title
    FROM levels
    ORDER BY sequence_number ASC, course ASC
  `).all() as LevelRow[];

  const levelStates = levels.map((level) => buildLevelState(database, level));
  const currentLevel = levelStates.find((level) => !level.isComplete) ?? null;
  const counts = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM characters WHERE status = 'learned') AS learned_character_count,
      (SELECT COUNT(*) FROM words WHERE status = 'learned') AS learned_word_count
  `).get() as {
    learned_character_count: number;
    learned_word_count: number;
  };

  return {
    level: currentLevel,
    courseComplete: currentLevel === null && levelStates.length > 0,
    learnedCharacterCount: counts.learned_character_count,
    learnedWordCount: counts.learned_word_count,
    totalLevelCount: levelStates.length
  };
}

function markItemLearned(
  database: Database.Database,
  tableName: "characters" | "words",
  id: string
) {
  const row = database.prepare(`SELECT id, status FROM ${tableName} WHERE id = ?`).get(id) as
    | { id: string; status: ItemStatus }
    | undefined;

  if (!row) {
    throw new LearningItemNotFoundError(`${tableName.slice(0, -1)} ${id} was not found.`);
  }

  if (row.status !== ItemStatus.Ready && row.status !== ItemStatus.Learned) {
    throw new LearningItemNotReadyError(`${tableName.slice(0, -1)} ${id} is not learnable yet.`);
  }

  if (row.status === ItemStatus.Learned) {
    return;
  }

  database.prepare(`
    UPDATE ${tableName}
    SET
      status = 'learned',
      learned_at = @learnedAt,
      blocked_reason = NULL,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id,
    learnedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function markCharacterLearned(database: Database.Database, id: string) {
  syncLearningStatuses(database);
  markItemLearned(database, "characters", id);
  return getCurrentLevelProgress(database);
}

export function markWordLearned(database: Database.Database, id: string) {
  syncLearningStatuses(database);
  markItemLearned(database, "words", id);
  return getCurrentLevelProgress(database);
}
