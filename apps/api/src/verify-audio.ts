import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import {
  AudioStatus,
  ItemSource,
  ItemStatus,
  QueueItemType,
  SentenceApprovalStatus
} from "@hanzi-learning-app/shared";

const verificationDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "hanzi-ticket-018-audio-")
);
const verificationDatabasePath = path.join(
  verificationDirectory,
  "verification.sqlite"
);

async function expectJson<T>(response: Response, expectedStatus = 200) {
  if (response.status !== expectedStatus) {
    const errorBody = await response.text();
    throw new Error(`Expected ${expectedStatus} but received ${response.status}: ${errorBody}`);
  }

  return await response.json() as T;
}

async function postJson<T>(baseUrl: string, pathName: string, body?: unknown, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  return await expectJson<T>(response, expectedStatus);
}

async function waitForSentenceAudio(
  baseUrl: string,
  wordId: string,
  sentenceId: string,
  expectedStatus: AudioStatus
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await expectJson<{
      items: Array<{
        id: string;
        audioStatus: AudioStatus;
        audioPath: string | null;
      }>;
    }>(await fetch(`${baseUrl}/words/${wordId}/sentences`));

    const sentence = response.items.find((item) => item.id === sentenceId);
    if (sentence?.audioStatus === expectedStatus) {
      return sentence;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for sentence ${sentenceId} audio status ${expectedStatus}.`);
}

async function waitForAudioFailureQueueItem(baseUrl: string, sentenceId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const queue = await expectJson<{
      items: Array<{
        id: string;
        type: QueueItemType;
        sentence?: { id: string };
      }>;
    }>(await fetch(`${baseUrl}/queue`));

    const item = queue.items.find(
      (queueItem) => queueItem.type === QueueItemType.AudioFailure && queueItem.sentence?.id === sentenceId
    );
    if (item) {
      return item;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for audio failure queue item for sentence ${sentenceId}.`);
}

async function main() {
  process.env.HANZI_DB_PATH = verificationDatabasePath;
  fs.rmSync(verificationDatabasePath, { force: true });

  const { createDatabaseConnection } = await import("./db/connection.js");
  const { runMigrations } = await import("./db/migrate.js");
  const { createApp } = await import("./app.js");
  const {
    queueSentenceAudioGeneration
  } = await import("./services/audio/audio-generation-service.js");
  const { createSentence } = await import("./services/sentences/sentence-service.js");

  const database = createDatabaseConnection();
  runMigrations(database);

  try {
    database.prepare(`
      INSERT INTO characters (
        id,
        hanzi,
        pinyin_display,
        pinyin_initial,
        pinyin_final,
        tone,
        meaning_primary,
        status,
        source,
        created_at,
        updated_at,
        pinyin_source,
        meaning_source
      )
      VALUES
        ('char-ni', '你', 'ni3', 'n', 'i', '3', 'you', @learnedStatus, @source, @timestamp, @timestamp, @source, @source),
        ('char-hao', '好', 'hao3', 'h', 'ao', '3', 'good', @learnedStatus, @source, @timestamp, @timestamp, @source, @source)
    `).run({
      learnedStatus: ItemStatus.Learned,
      source: ItemSource.Manual,
      timestamp: "2026-01-01T00:00:00.000Z"
    });

    database.prepare(`
      INSERT INTO words (
        id,
        simplified,
        pinyin_display,
        meaning_primary,
        status,
        source,
        created_at,
        updated_at,
        pinyin_source,
        meaning_source
      )
      VALUES
        ('word-nihao', '你好', 'ni3 hao3', 'hello', @learnedStatus, @source, @timestamp, @timestamp, @source, @source)
    `).run({
      learnedStatus: ItemStatus.Learned,
      source: ItemSource.Manual,
      timestamp: "2026-01-01T00:00:00.000Z"
    });

    const app = createApp(database);
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));

    try {
      const address = server.address();
      assert(address && typeof address === "object");
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const manualSentence = await postJson<{
        id: string;
        audioStatus: AudioStatus;
      }>(baseUrl, "/words/word-nihao/manual-sentences", {
        text: "你好。",
        translation: "Hello.",
        pinyinFull: "ni3 hao3."
      }, 201);

      assert.equal(
        [AudioStatus.Pending, AudioStatus.Ready].includes(manualSentence.audioStatus),
        true
      );

      const readySentence = await waitForSentenceAudio(
        baseUrl,
        "word-nihao",
        manualSentence.id,
        AudioStatus.Ready
      );
      assert(readySentence.audioPath);

      const audioResponse = await fetch(`${baseUrl}${readySentence.audioPath}`);
      assert.equal(audioResponse.status, 200);
      assert.match(audioResponse.headers.get("content-type") ?? "", /audio\/wav|audio\/x-wav/i);

      const failureSentence = createSentence(database, {
        text: "你好！",
        translation: "Hello!",
        pinyinFull: "ni3 hao3!",
        approvalStatus: SentenceApprovalStatus.Approved,
        audioStatus: AudioStatus.None,
        audioPath: null,
        generationSource: ItemSource.Manual,
        notes: "verification failure sentence",
        linkedWords: [
          { wordId: "word-nihao", sortOrder: 0 }
        ],
        analysisSpans: [
          {
            text: "你好",
            spanType: "known_word",
            linkedWordId: "word-nihao",
            linkedCharacterId: null,
            glossText: "hello",
            pinyinText: "ni3 hao3"
          },
          {
            text: "！",
            spanType: "punctuation",
            linkedWordId: null,
            linkedCharacterId: null,
            glossText: null,
            pinyinText: null
          }
        ]
      });

      queueSentenceAudioGeneration(database, failureSentence.id, {
        provider: {
          generateAudio() {
            throw new Error("Simulated audio provider failure");
          }
        }
      });

      await waitForSentenceAudio(baseUrl, "word-nihao", failureSentence.id, AudioStatus.Failed);
      const audioFailureItem = await waitForAudioFailureQueueItem(baseUrl, failureSentence.id);

      await postJson(
        baseUrl,
        `/queue/items/${audioFailureItem.id}/actions`,
        { action: "regenerate_audio" }
      );

      const regeneratedSentence = await waitForSentenceAudio(
        baseUrl,
        "word-nihao",
        failureSentence.id,
        AudioStatus.Ready
      );
      assert(regeneratedSentence.audioPath);

      const refreshedQueue = await expectJson<{
        items: Array<{
          type: QueueItemType;
          sentence?: { id: string };
        }>;
      }>(await fetch(`${baseUrl}/queue`));
      assert.equal(
        refreshedQueue.items.some(
          (item) => item.type === QueueItemType.AudioFailure && item.sentence?.id === failureSentence.id
        ),
        false
      );
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
    }

    console.log("Ticket 018 audio generation verification passed.");
  } finally {
    database.close();
    fs.rmSync(verificationDirectory, { recursive: true, force: true });
  }
}

void main();
