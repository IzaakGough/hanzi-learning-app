import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { QueueItemType } from "@hanzi-learning-app/shared";

const verificationDatabasePath = path.join(
  os.tmpdir(),
  `hanzi-ticket-013-dashboard-${Date.now()}.sqlite`
);

interface DashboardResponse {
  dueReview: {
    characterCount: number;
    wordCount: number;
    totalCount: number;
  };
  learningProgress: {
    level: {
      sequenceNumber: number;
      nextCharacterId: string | null;
      words: Array<{ status: string }>;
    } | null;
  };
  contentQueue: {
    hasWork: boolean;
    totalCount: number;
    counts: Array<{
      type: QueueItemType;
      count: number;
    }>;
  };
}

interface QueueResponse {
  counts: Array<{
    type: QueueItemType;
    count: number;
  }>;
  items: unknown[];
}

interface ReviewQueueResponse {
  items: unknown[];
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

  const app = createApp(database);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const [dashboardResponse, characterQueueResponse, wordQueueResponse, queueResponse] = await Promise.all([
      fetch(`${baseUrl}/dashboard`),
      fetch(`${baseUrl}/reviews/characters/due`),
      fetch(`${baseUrl}/reviews/words/due`),
      fetch(`${baseUrl}/queue`)
    ]);

    assert.equal(dashboardResponse.status, 200);
    assert.equal(characterQueueResponse.status, 200);
    assert.equal(wordQueueResponse.status, 200);
    assert.equal(queueResponse.status, 200);

    const dashboard = await dashboardResponse.json() as DashboardResponse;
    const characterQueue = await characterQueueResponse.json() as ReviewQueueResponse;
    const wordQueue = await wordQueueResponse.json() as ReviewQueueResponse;
    const queue = await queueResponse.json() as QueueResponse;

    assert.equal(dashboard.dueReview.characterCount, characterQueue.items.length);
    assert.equal(dashboard.dueReview.wordCount, wordQueue.items.length);
    assert.equal(dashboard.dueReview.totalCount, characterQueue.items.length + wordQueue.items.length);

    assert(dashboard.learningProgress.level);
    assert.equal(dashboard.learningProgress.level.sequenceNumber, 21);
    assert.notEqual(dashboard.learningProgress.level.nextCharacterId, null);
    assert(dashboard.learningProgress.level.words.some((word) => word.status === "blocked"));

    assert.equal(dashboard.contentQueue.totalCount, queue.items.length);
    assert.equal(
      dashboard.contentQueue.hasWork,
      queue.counts.some((count) => count.count > 0)
    );
    assert.deepEqual(dashboard.contentQueue.counts, queue.counts);

    console.log("Ticket 013 dashboard verification passed.");
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
