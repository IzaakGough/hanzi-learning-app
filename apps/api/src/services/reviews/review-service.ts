import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  ItemStatus,
  ReviewGrade,
  SchedulerType,
  type CharacterReviewQueueResponse,
  type CharacterReviewStateRecord,
  type DueCharacterReviewItem,
  type DueWordReviewItem,
  type ReviewEventRecord,
  type ReviewItemKind,
  type ReviewSubmissionResult,
  type ReviewStateRecord,
  type WordReviewQueueResponse,
  type WordReviewStateRecord
} from "@hanzi-learning-app/shared";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const TARGET_RETENTION = 0.9;

interface CharacterReviewRow {
  id: string;
  character_id: string;
  scheduler_type: SchedulerType;
  due_at: string;
  stability: number | null;
  difficulty: number | null;
  last_reviewed_at: string | null;
  review_count: number;
  lapse_count: number;
  created_at: string;
  updated_at: string;
}

interface WordReviewRow {
  id: string;
  word_id: string;
  scheduler_type: SchedulerType;
  due_at: string;
  stability: number | null;
  difficulty: number | null;
  last_reviewed_at: string | null;
  review_count: number;
  lapse_count: number;
  created_at: string;
  updated_at: string;
}

interface ReviewableItemRow {
  id: string;
  learned_at: string | null;
}

interface ReviewGradeComputation {
  dueAt: string;
  stability: number | null;
  difficulty: number | null;
  elapsedDays: number;
  nextReviewCount: number;
  nextLapseCount: number;
}

export class ReviewItemNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewItemNotFoundError";
  }
}

export class ReviewItemNotEligibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewItemNotEligibleError";
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function addDays(isoTimestamp: string, days: number) {
  return new Date(new Date(isoTimestamp).getTime() + (days * DAY_IN_MS)).toISOString();
}

function diffDays(startIso: string, endIso: string) {
  return Math.max(0, (new Date(endIso).getTime() - new Date(startIso).getTime()) / DAY_IN_MS);
}

function mapCharacterReviewState(row: CharacterReviewRow): CharacterReviewStateRecord {
  return {
    id: row.id,
    characterId: row.character_id,
    schedulerType: row.scheduler_type,
    dueAt: row.due_at,
    stability: row.stability,
    difficulty: row.difficulty,
    lastReviewedAt: row.last_reviewed_at,
    reviewCount: row.review_count,
    lapseCount: row.lapse_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapWordReviewState(row: WordReviewRow): WordReviewStateRecord {
  return {
    id: row.id,
    wordId: row.word_id,
    schedulerType: row.scheduler_type,
    dueAt: row.due_at,
    stability: row.stability,
    difficulty: row.difficulty,
    lastReviewedAt: row.last_reviewed_at,
    reviewCount: row.review_count,
    lapseCount: row.lapse_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapReviewEvent(row: {
  id: string;
  item_kind: ReviewItemKind;
  item_id: string;
  scheduler_type: SchedulerType;
  grade: ReviewGrade;
  reviewed_at: string;
  due_at_before: string | null;
  due_at_after: string;
  stability_before: number | null;
  stability_after: number | null;
  difficulty_before: number | null;
  difficulty_after: number | null;
  elapsed_days: number;
  review_count_after: number;
  lapse_count_after: number;
  created_at: string;
}): ReviewEventRecord {
  return {
    id: row.id,
    itemKind: row.item_kind,
    itemId: row.item_id,
    schedulerType: row.scheduler_type,
    grade: row.grade,
    reviewedAt: row.reviewed_at,
    dueAtBefore: row.due_at_before,
    dueAtAfter: row.due_at_after,
    stabilityBefore: row.stability_before,
    stabilityAfter: row.stability_after,
    difficultyBefore: row.difficulty_before,
    difficultyAfter: row.difficulty_after,
    elapsedDays: row.elapsed_days,
    reviewCountAfter: row.review_count_after,
    lapseCountAfter: row.lapse_count_after,
    createdAt: row.created_at,
    updatedAt: row.created_at
  };
}

function getReviewableItems(
  database: Database.Database,
  tableName: "characters" | "words"
) {
  return database.prepare(`
    SELECT id, learned_at
    FROM ${tableName}
    WHERE status = 'learned' AND archived_at IS NULL
  `).all() as ReviewableItemRow[];
}

function ensureReviewStateRows(
  database: Database.Database,
  params: {
    itemKind: ReviewItemKind;
    stateTable: "character_review_state" | "word_review_state";
    itemColumn: "character_id" | "word_id";
    itemTable: "characters" | "words";
  }
) {
  const insert = database.prepare(`
    INSERT INTO ${params.stateTable} (
      id,
      ${params.itemColumn},
      scheduler_type,
      due_at,
      stability,
      difficulty,
      last_reviewed_at,
      review_count,
      lapse_count,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @itemId,
      @schedulerType,
      @dueAt,
      NULL,
      NULL,
      NULL,
      0,
      0,
      @createdAt,
      @updatedAt
    )
  `);

  const items = getReviewableItems(database, params.itemTable);

  for (const item of items) {
    const existing = database.prepare(`
      SELECT id
      FROM ${params.stateTable}
      WHERE ${params.itemColumn} = ?
    `).get(item.id) as { id: string } | undefined;

    if (existing) {
      continue;
    }

    const dueAt = item.learned_at ?? new Date().toISOString();

    insert.run({
      id: randomUUID(),
      itemId: item.id,
      schedulerType: SchedulerType.Fsrs,
      dueAt,
      createdAt: dueAt,
      updatedAt: dueAt
    });
  }
}

export function ensureReviewStatesForLearnedItems(database: Database.Database) {
  ensureReviewStateRows(database, {
    itemKind: "character",
    stateTable: "character_review_state",
    itemColumn: "character_id",
    itemTable: "characters"
  });
  ensureReviewStateRows(database, {
    itemKind: "word",
    stateTable: "word_review_state",
    itemColumn: "word_id",
    itemTable: "words"
  });
}

function getCharacterStateById(database: Database.Database, characterId: string) {
  return database.prepare(`
    SELECT *
    FROM character_review_state
    WHERE character_id = ?
  `).get(characterId) as CharacterReviewRow | undefined;
}

function getWordStateById(database: Database.Database, wordId: string) {
  return database.prepare(`
    SELECT *
    FROM word_review_state
    WHERE word_id = ?
  `).get(wordId) as WordReviewRow | undefined;
}

function getReviewableCharacter(database: Database.Database, characterId: string) {
  return database.prepare(`
    SELECT id, learned_at
    FROM characters
    WHERE id = ? AND status = 'learned' AND archived_at IS NULL
  `).get(characterId) as ReviewableItemRow | undefined;
}

function getReviewableWord(database: Database.Database, wordId: string) {
  return database.prepare(`
    SELECT id, learned_at
    FROM words
    WHERE id = ? AND status = 'learned' AND archived_at IS NULL
  `).get(wordId) as ReviewableItemRow | undefined;
}

function getInitialDifficulty(grade: ReviewGrade) {
  switch (grade) {
    case ReviewGrade.Again:
      return 8.6;
    case ReviewGrade.Hard:
      return 6.7;
    case ReviewGrade.Good:
      return 5.2;
    case ReviewGrade.Easy:
      return 4.0;
  }
}

function getInitialStabilityDays(grade: ReviewGrade) {
  switch (grade) {
    case ReviewGrade.Again:
      return 0.15;
    case ReviewGrade.Hard:
      return 0.6;
    case ReviewGrade.Good:
      return 2.5;
    case ReviewGrade.Easy:
      return 5.5;
  }
}

function computeNextReview(
  state: ReviewStateRecord,
  grade: ReviewGrade,
  reviewedAt: string
): ReviewGradeComputation {
  const baselineTimestamp = state.lastReviewedAt ?? state.dueAt;
  const elapsedDays = diffDays(baselineTimestamp, reviewedAt);
  const nextReviewCount = state.reviewCount + 1;
  const nextLapseCount = state.lapseCount + (grade === ReviewGrade.Again ? 1 : 0);

  if (state.stability == null || state.difficulty == null) {
    const stability = getInitialStabilityDays(grade);
    const difficulty = getInitialDifficulty(grade);

    return {
      dueAt: addDays(reviewedAt, stability),
      stability,
      difficulty,
      elapsedDays,
      nextReviewCount,
      nextLapseCount
    };
  }

  const retrievability = Math.exp(Math.log(TARGET_RETENTION) * (elapsedDays / Math.max(state.stability, 0.1)));
  const difficultyDeltaByGrade: Record<ReviewGrade, number> = {
    [ReviewGrade.Again]: 1.2,
    [ReviewGrade.Hard]: 0.45,
    [ReviewGrade.Good]: -0.2,
    [ReviewGrade.Easy]: -0.65
  };

  const nextDifficulty = clamp(state.difficulty + difficultyDeltaByGrade[grade], 1, 10);

  let nextStability: number;
  if (grade === ReviewGrade.Again) {
    nextStability = Math.max(
      0.15,
      state.stability * (0.35 + ((11 - state.difficulty) * 0.03) + ((1 - retrievability) * 0.6))
    );
  } else {
    const gradeBonus: Record<Exclude<ReviewGrade, ReviewGrade.Again>, number> = {
      [ReviewGrade.Hard]: 0.85,
      [ReviewGrade.Good]: 1.2,
      [ReviewGrade.Easy]: 1.55
    };

    nextStability = Math.max(
      state.stability + 0.01,
      state.stability * (
        1 + (((11 - state.difficulty) * 0.08) * ((1 - retrievability) + 0.05) * gradeBonus[grade])
      )
    );
  }

  return {
    dueAt: addDays(reviewedAt, nextStability),
    stability: nextStability,
    difficulty: nextDifficulty,
    elapsedDays,
    nextReviewCount,
    nextLapseCount
  };
}

function requireCharacterReviewState(database: Database.Database, characterId: string) {
  ensureReviewStatesForLearnedItems(database);

  const item = getReviewableCharacter(database, characterId);
  if (!item) {
    throw new ReviewItemNotEligibleError(`character ${characterId} is not review-eligible.`);
  }

  const state = getCharacterStateById(database, characterId);
  if (!state) {
    throw new ReviewItemNotFoundError(`review state for character ${characterId} was not found.`);
  }

  return mapCharacterReviewState(state);
}

function requireWordReviewState(database: Database.Database, wordId: string) {
  ensureReviewStatesForLearnedItems(database);

  const item = getReviewableWord(database, wordId);
  if (!item) {
    throw new ReviewItemNotEligibleError(`word ${wordId} is not review-eligible.`);
  }

  const state = getWordStateById(database, wordId);
  if (!state) {
    throw new ReviewItemNotFoundError(`review state for word ${wordId} was not found.`);
  }

  return mapWordReviewState(state);
}

export function listDueCharacterReviews(
  database: Database.Database,
  asOf = new Date().toISOString()
): CharacterReviewQueueResponse {
  ensureReviewStatesForLearnedItems(database);

  const rows = database.prepare(`
    SELECT
      c.id,
      c.hanzi,
      c.pinyin_display,
      c.meaning_primary,
      c.learned_at,
      rs.id AS review_state_id,
      rs.scheduler_type,
      rs.due_at,
      rs.stability,
      rs.difficulty,
      rs.last_reviewed_at,
      rs.review_count,
      rs.lapse_count,
      rs.created_at AS review_created_at,
      rs.updated_at AS review_updated_at
    FROM character_review_state rs
    INNER JOIN characters c ON c.id = rs.character_id
    WHERE c.status = 'learned'
      AND c.archived_at IS NULL
      AND rs.due_at <= ?
    ORDER BY rs.due_at ASC, c.hanzi ASC
  `).all(asOf) as Array<{
    id: string;
    hanzi: string;
    pinyin_display: string | null;
    meaning_primary: string | null;
    learned_at: string | null;
    review_state_id: string;
    scheduler_type: SchedulerType;
    due_at: string;
    stability: number | null;
    difficulty: number | null;
    last_reviewed_at: string | null;
    review_count: number;
    lapse_count: number;
    review_created_at: string;
    review_updated_at: string;
  }>;

  const items: DueCharacterReviewItem[] = rows.map((row) => ({
    id: row.id,
    hanzi: row.hanzi,
    pinyinDisplay: row.pinyin_display,
    meaningPrimary: row.meaning_primary,
    learnedAt: row.learned_at,
    reviewState: {
      id: row.review_state_id,
      characterId: row.id,
      schedulerType: row.scheduler_type,
      dueAt: row.due_at,
      stability: row.stability,
      difficulty: row.difficulty,
      lastReviewedAt: row.last_reviewed_at,
      reviewCount: row.review_count,
      lapseCount: row.lapse_count,
      createdAt: row.review_created_at,
      updatedAt: row.review_updated_at
    }
  }));

  return { items };
}

export function listDueWordReviews(
  database: Database.Database,
  asOf = new Date().toISOString()
): WordReviewQueueResponse {
  ensureReviewStatesForLearnedItems(database);

  const rows = database.prepare(`
    SELECT
      w.id,
      w.simplified,
      w.pinyin_display,
      w.meaning_primary,
      w.learned_at,
      rs.id AS review_state_id,
      rs.scheduler_type,
      rs.due_at,
      rs.stability,
      rs.difficulty,
      rs.last_reviewed_at,
      rs.review_count,
      rs.lapse_count,
      rs.created_at AS review_created_at,
      rs.updated_at AS review_updated_at
    FROM word_review_state rs
    INNER JOIN words w ON w.id = rs.word_id
    WHERE w.status = 'learned'
      AND w.archived_at IS NULL
      AND rs.due_at <= ?
    ORDER BY rs.due_at ASC, w.simplified ASC
  `).all(asOf) as Array<{
    id: string;
    simplified: string;
    pinyin_display: string | null;
    meaning_primary: string | null;
    learned_at: string | null;
    review_state_id: string;
    scheduler_type: SchedulerType;
    due_at: string;
    stability: number | null;
    difficulty: number | null;
    last_reviewed_at: string | null;
    review_count: number;
    lapse_count: number;
    review_created_at: string;
    review_updated_at: string;
  }>;

  const items: DueWordReviewItem[] = rows.map((row) => ({
    id: row.id,
    simplified: row.simplified,
    pinyinDisplay: row.pinyin_display,
    meaningPrimary: row.meaning_primary,
    learnedAt: row.learned_at,
    reviewState: {
      id: row.review_state_id,
      wordId: row.id,
      schedulerType: row.scheduler_type,
      dueAt: row.due_at,
      stability: row.stability,
      difficulty: row.difficulty,
      lastReviewedAt: row.last_reviewed_at,
      reviewCount: row.review_count,
      lapseCount: row.lapse_count,
      createdAt: row.review_created_at,
      updatedAt: row.review_updated_at
    }
  }));

  return { items };
}

function updateCharacterReviewState(
  database: Database.Database,
  characterId: string,
  currentState: CharacterReviewStateRecord,
  grade: ReviewGrade,
  reviewedAt: string
) {
  const next = computeNextReview(currentState, grade, reviewedAt);
  const updatedAt = reviewedAt;

  database.prepare(`
    UPDATE character_review_state
    SET
      due_at = @dueAt,
      stability = @stability,
      difficulty = @difficulty,
      last_reviewed_at = @lastReviewedAt,
      review_count = @reviewCount,
      lapse_count = @lapseCount,
      updated_at = @updatedAt
    WHERE character_id = @characterId
  `).run({
    characterId,
    dueAt: next.dueAt,
    stability: next.stability,
    difficulty: next.difficulty,
    lastReviewedAt: reviewedAt,
    reviewCount: next.nextReviewCount,
    lapseCount: next.nextLapseCount,
    updatedAt
  });

  const updatedState = requireCharacterReviewState(database, characterId);
  const event = insertReviewEvent(database, {
    itemKind: "character",
    itemId: characterId,
    grade,
    reviewedAt,
    before: currentState,
    after: updatedState,
    elapsedDays: next.elapsedDays
  });

  return {
    itemKind: "character" as const,
    itemId: characterId,
    grade,
    reviewState: updatedState,
    event
  } satisfies ReviewSubmissionResult;
}

function updateWordReviewState(
  database: Database.Database,
  wordId: string,
  currentState: WordReviewStateRecord,
  grade: ReviewGrade,
  reviewedAt: string
) {
  const next = computeNextReview(currentState, grade, reviewedAt);
  const updatedAt = reviewedAt;

  database.prepare(`
    UPDATE word_review_state
    SET
      due_at = @dueAt,
      stability = @stability,
      difficulty = @difficulty,
      last_reviewed_at = @lastReviewedAt,
      review_count = @reviewCount,
      lapse_count = @lapseCount,
      updated_at = @updatedAt
    WHERE word_id = @wordId
  `).run({
    wordId,
    dueAt: next.dueAt,
    stability: next.stability,
    difficulty: next.difficulty,
    lastReviewedAt: reviewedAt,
    reviewCount: next.nextReviewCount,
    lapseCount: next.nextLapseCount,
    updatedAt
  });

  const updatedState = requireWordReviewState(database, wordId);
  const event = insertReviewEvent(database, {
    itemKind: "word",
    itemId: wordId,
    grade,
    reviewedAt,
    before: currentState,
    after: updatedState,
    elapsedDays: next.elapsedDays
  });

  return {
    itemKind: "word" as const,
    itemId: wordId,
    grade,
    reviewState: updatedState,
    event
  } satisfies ReviewSubmissionResult;
}

function insertReviewEvent(
  database: Database.Database,
  params: {
    itemKind: ReviewItemKind;
    itemId: string;
    grade: ReviewGrade;
    reviewedAt: string;
    before: CharacterReviewStateRecord | WordReviewStateRecord;
    after: CharacterReviewStateRecord | WordReviewStateRecord;
    elapsedDays: number;
  }
) {
  const id = randomUUID();

  database.prepare(`
    INSERT INTO review_events (
      id,
      item_kind,
      item_id,
      scheduler_type,
      grade,
      reviewed_at,
      due_at_before,
      due_at_after,
      stability_before,
      stability_after,
      difficulty_before,
      difficulty_after,
      elapsed_days,
      review_count_after,
      lapse_count_after,
      created_at
    )
    VALUES (
      @id,
      @itemKind,
      @itemId,
      @schedulerType,
      @grade,
      @reviewedAt,
      @dueAtBefore,
      @dueAtAfter,
      @stabilityBefore,
      @stabilityAfter,
      @difficultyBefore,
      @difficultyAfter,
      @elapsedDays,
      @reviewCountAfter,
      @lapseCountAfter,
      @createdAt
    )
  `).run({
    id,
    itemKind: params.itemKind,
    itemId: params.itemId,
    schedulerType: SchedulerType.Fsrs,
    grade: params.grade,
    reviewedAt: params.reviewedAt,
    dueAtBefore: params.before.dueAt,
    dueAtAfter: params.after.dueAt,
    stabilityBefore: params.before.stability,
    stabilityAfter: params.after.stability,
    difficultyBefore: params.before.difficulty,
    difficultyAfter: params.after.difficulty,
    elapsedDays: params.elapsedDays,
    reviewCountAfter: params.after.reviewCount,
    lapseCountAfter: params.after.lapseCount,
    createdAt: params.reviewedAt
  });

  const row = database.prepare(`
    SELECT *
    FROM review_events
    WHERE id = ?
  `).get(id) as {
    id: string;
    item_kind: ReviewItemKind;
    item_id: string;
    scheduler_type: SchedulerType;
    grade: ReviewGrade;
    reviewed_at: string;
    due_at_before: string | null;
    due_at_after: string;
    stability_before: number | null;
    stability_after: number | null;
    difficulty_before: number | null;
    difficulty_after: number | null;
    elapsed_days: number;
    review_count_after: number;
    lapse_count_after: number;
    created_at: string;
  };

  return mapReviewEvent(row);
}

export function gradeCharacterReview(
  database: Database.Database,
  characterId: string,
  grade: ReviewGrade,
  reviewedAt = new Date().toISOString()
) {
  const execute = database.transaction(() => {
    const currentState = requireCharacterReviewState(database, characterId);
    return updateCharacterReviewState(database, characterId, currentState, grade, reviewedAt);
  });

  return execute();
}

export function gradeWordReview(
  database: Database.Database,
  wordId: string,
  grade: ReviewGrade,
  reviewedAt = new Date().toISOString()
) {
  const execute = database.transaction(() => {
    const currentState = requireWordReviewState(database, wordId);
    return updateWordReviewState(database, wordId, currentState, grade, reviewedAt);
  });

  return execute();
}

export function seedReviewStateForLearnedItem(
  database: Database.Database,
  params: {
    itemKind: ReviewItemKind;
    itemId: string;
  }
) {
  ensureReviewStatesForLearnedItems(database);

  if (params.itemKind === "character") {
    return requireCharacterReviewState(database, params.itemId);
  }

  return requireWordReviewState(database, params.itemId);
}
