import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";

const verificationDatabasePath = path.join(
  os.tmpdir(),
  `hanzi-ticket-011-reviews-${Date.now()}.sqlite`
);

const HANZI = {
  ni: "\u4f60",
  hao: "\u597d",
  nihao: "\u4f60\u597d",
  zhongguo: "\u4e2d\u56fd",
  xue: "\u5b66"
} as const;

interface ReviewQueueItemState {
  dueAt: string;
  stability: number | null;
  difficulty: number | null;
  lastReviewedAt: string | null;
  reviewCount: number;
  lapseCount: number;
}

interface CharacterReviewQueueResponse {
  items: Array<{
    id: string;
    hanzi: string;
    reviewState: ReviewQueueItemState;
  }>;
}

interface WordReviewQueueResponse {
  items: Array<{
    id: string;
    simplified: string;
    reviewState: ReviewQueueItemState;
  }>;
}

interface ReviewSubmissionResponse {
  itemKind: "character" | "word";
  itemId: string;
  grade: string;
  reviewState: ReviewQueueItemState;
  event: {
    itemKind: "character" | "word";
    itemId: string;
    grade: string;
    dueAtBefore: string | null;
    dueAtAfter: string;
    stabilityBefore: number | null;
    stabilityAfter: number | null;
    difficultyBefore: number | null;
    difficultyAfter: number | null;
    reviewCountAfter: number;
    lapseCountAfter: number;
  };
}

interface CurrentLevelResponse {
  level: {
    characters: Array<{
      id: string;
      hanzi: string;
      status: string;
    }>;
  } | null;
}

async function postJson<T>(baseUrl: string, pathName: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  assert.equal(response.status, 200);
  return await response.json() as T;
}

async function main() {
  process.env.HANZI_DB_PATH = verificationDatabasePath;
  process.env.HANZI_SEED_EXAMPLE_DECOMPOSITIONS = "1";
  fs.rmSync(verificationDatabasePath, { force: true });

  const { createDatabaseConnection } = await import("./db/connection.js");
  const { runMigrations } = await import("./db/migrate.js");
  const { createApp } = await import("./app.js");
  const { exampleImportsDirectory } = await import("./imports/paths.js");
  const { loadNormalizedImportFile } = await import("./imports/load-import-file.js");
  const { runNormalizedImport } = await import("./services/imports/import-service.js");

  const database = createDatabaseConnection();
  runMigrations(database);

  for (const fileName of [
    "known_characters.json",
    "known_words.json",
    "levels.json",
    "pinyin_mappings.json"
  ]) {
    runNormalizedImport(database, loadNormalizedImportFile(path.join(exampleImportsDirectory, fileName)));
  }

  const seededCounts = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM character_review_state) AS character_review_count,
      (SELECT COUNT(*) FROM word_review_state) AS word_review_count
  `).get() as {
    character_review_count: number;
    word_review_count: number;
  };

  assert.deepEqual(seededCounts, {
    character_review_count: 2,
    word_review_count: 2
  });

  const seededKnownCharacter = database.prepare(`
    SELECT due_at, stability, difficulty, last_reviewed_at, review_count, lapse_count
    FROM character_review_state rs
    INNER JOIN characters c ON c.id = rs.character_id
    WHERE c.hanzi = ?
  `).get(HANZI.ni) as {
    due_at: string;
    stability: number | null;
    difficulty: number | null;
    last_reviewed_at: string | null;
    review_count: number;
    lapse_count: number;
  } | undefined;

  assert(seededKnownCharacter);
  assert.equal(seededKnownCharacter.stability, null);
  assert.equal(seededKnownCharacter.difficulty, null);
  assert.equal(seededKnownCharacter.last_reviewed_at, null);
  assert.equal(seededKnownCharacter.review_count, 0);
  assert.equal(seededKnownCharacter.lapse_count, 0);

  const app = createApp(database);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const initialCharacterQueueResponse = await fetch(`${baseUrl}/reviews/characters/due`);
    assert.equal(initialCharacterQueueResponse.status, 200);
    const initialCharacterQueue = await initialCharacterQueueResponse.json() as CharacterReviewQueueResponse;
    assert.deepEqual(initialCharacterQueue.items.map((item) => item.hanzi), [HANZI.ni, HANZI.hao]);

    const initialWordQueueResponse = await fetch(`${baseUrl}/reviews/words/due`);
    assert.equal(initialWordQueueResponse.status, 200);
    const initialWordQueue = await initialWordQueueResponse.json() as WordReviewQueueResponse;
    assert.deepEqual(initialWordQueue.items.map((item) => item.simplified), [HANZI.zhongguo, HANZI.nihao]);

    const levelResponse = await fetch(`${baseUrl}/levels/current`);
    assert.equal(levelResponse.status, 200);
    const currentLevel = await levelResponse.json() as CurrentLevelResponse;
    assert(currentLevel.level);
    const xue = currentLevel.level.characters.find((character) => character.hanzi === HANZI.xue);
    assert(xue);

    await postJson(baseUrl, `/learning/characters/${xue.id}/learned`);

    const afterLearnCharacterQueueResponse = await fetch(`${baseUrl}/reviews/characters/due`);
    assert.equal(afterLearnCharacterQueueResponse.status, 200);
    const afterLearnCharacterQueue = await afterLearnCharacterQueueResponse.json() as CharacterReviewQueueResponse;
    assert(afterLearnCharacterQueue.items.some((item) => item.hanzi === HANZI.xue));

    const gradedCharacter = await postJson<ReviewSubmissionResponse>(
      baseUrl,
      `/reviews/characters/${xue.id}/grade`,
      { grade: "good" }
    );
    assert.equal(gradedCharacter.itemKind, "character");
    assert.equal(gradedCharacter.grade, "good");
    assert.equal(gradedCharacter.reviewState.reviewCount, 1);
    assert.equal(gradedCharacter.reviewState.lapseCount, 0);
    assert.equal(gradedCharacter.reviewState.stability, gradedCharacter.event.stabilityAfter);
    assert.notEqual(gradedCharacter.reviewState.stability, null);
    assert.notEqual(gradedCharacter.reviewState.difficulty, null);
    assert.equal(gradedCharacter.event.stabilityBefore, null);
    assert.equal(gradedCharacter.event.difficultyBefore, null);
    assert.equal(gradedCharacter.event.reviewCountAfter, 1);

    const gradedWord = await postJson<ReviewSubmissionResponse>(
      baseUrl,
      `/reviews/words/${initialWordQueue.items[0]!.id}/grade`,
      { grade: "again" }
    );
    assert.equal(gradedWord.itemKind, "word");
    assert.equal(gradedWord.grade, "again");
    assert.equal(gradedWord.reviewState.reviewCount, 1);
    assert.equal(gradedWord.reviewState.lapseCount, 1);
    assert.equal(gradedWord.event.lapseCountAfter, 1);

    const postGradeCharacterQueueResponse = await fetch(`${baseUrl}/reviews/characters/due`);
    assert.equal(postGradeCharacterQueueResponse.status, 200);
    const postGradeCharacterQueue = await postGradeCharacterQueueResponse.json() as CharacterReviewQueueResponse;
    assert(!postGradeCharacterQueue.items.some((item) => item.id === xue.id));

    const eventCounts = database.prepare(`
      SELECT
        COUNT(*) AS total_events,
        SUM(CASE WHEN item_kind = 'character' THEN 1 ELSE 0 END) AS character_events,
        SUM(CASE WHEN item_kind = 'word' THEN 1 ELSE 0 END) AS word_events
      FROM review_events
    `).get() as {
      total_events: number;
      character_events: number;
      word_events: number;
    };

    assert.deepEqual(eventCounts, {
      total_events: 2,
      character_events: 1,
      word_events: 1
    });

    console.log("Ticket 011 review verification passed.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    database.close();
    fs.rmSync(verificationDatabasePath, { force: true });
  }
}

void main();
