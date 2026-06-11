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

const verificationDatabasePath = path.join(
  os.tmpdir(),
  `hanzi-ticket-016-sentences-${Date.now()}.sqlite`
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

async function waitForSentenceCandidate(baseUrl: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const queue = await expectJson<{
      counts: Array<{ type: QueueItemType; count: number }>;
      items: Array<{
        id: string;
        type: QueueItemType;
        sentence?: {
          id: string;
          text: string;
          approvalStatus: SentenceApprovalStatus;
          linkedWords: Array<{ id: string; simplified: string }>;
          displaySpans?: Array<{ text: string }>;
        };
      }>;
    }>(await fetch(`${baseUrl}/queue`));

    const candidate = queue.items.find((item) => item.type === QueueItemType.SentenceCandidate);
    if (candidate?.sentence) {
      return candidate;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Timed out waiting for a sentence candidate.");
}

async function main() {
  process.env.HANZI_DB_PATH = verificationDatabasePath;
  fs.rmSync(verificationDatabasePath, { force: true });

  const { createDatabaseConnection } = await import("./db/connection.js");
  const { runMigrations } = await import("./db/migrate.js");
  const { createApp } = await import("./app.js");
  const {
    createSentence,
    getSentenceDetail,
    recomputeSentenceDisplay
  } = await import("./services/sentences/sentence-service.js");

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
        ('char-hao', '好', 'hao3', 'h', 'ao', '3', 'good', @learnedStatus, @source, @timestamp, @timestamp, @source, @source),
        ('char-ma', '吗', 'ma5', 'm', 'a', '5', 'question particle', @readyStatus, @source, @timestamp, @timestamp, @source, @source),
        ('char-ne', '呢', 'ne5', 'n', 'e', '5', 'particle', @learnedStatus, @source, @timestamp, @timestamp, @source, @source)
    `).run({
      learnedStatus: ItemStatus.Learned,
      readyStatus: ItemStatus.Ready,
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
        ('word-nihao', '你好', 'ni3 hao3', 'hello', @learnedStatus, @source, @timestamp, @timestamp, @source, @source),
        ('word-nima', '你吗', 'ni3 ma5', 'you question', @readyStatus, @source, @timestamp, @timestamp, @source, @source)
    `).run({
      learnedStatus: ItemStatus.Learned,
      readyStatus: ItemStatus.Ready,
      source: ItemSource.Manual,
      timestamp: "2026-01-01T00:00:00.000Z"
    });

    const sentence = createSentence(database, {
      text: "你好，你吗呢？",
      translation: "Hello, is it you then?",
      pinyinFull: "ni3 hao3, ni3 ma5 ne5?",
      approvalStatus: SentenceApprovalStatus.Approved,
      audioStatus: AudioStatus.None,
      audioPath: null,
      generationSource: ItemSource.Manual,
      notes: "verification sentence",
      linkedWords: [
        { wordId: "word-nihao", sortOrder: 0 },
        { wordId: "word-nima", sortOrder: 1 }
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
          text: "，",
          spanType: "punctuation",
          linkedWordId: null,
          linkedCharacterId: null,
          glossText: null,
          pinyinText: null
        },
        {
          text: "你吗",
          spanType: "unknown_word",
          linkedWordId: "word-nima",
          linkedCharacterId: null,
          glossText: "you question",
          pinyinText: "ni3 ma5"
        },
        {
          text: "呢",
          spanType: "fallback_character",
          linkedWordId: null,
          linkedCharacterId: "char-ne",
          glossText: "particle",
          pinyinText: "ne5"
        },
        {
          text: "？",
          spanType: "punctuation",
          linkedWordId: null,
          linkedCharacterId: null,
          glossText: null,
          pinyinText: null
        }
      ]
    });

    const storedSentence = getSentenceDetail(database, sentence.id);
    assert.equal(storedSentence.linkedWords.length, 2);
    assert.equal(storedSentence.analysisSpans.length, 5);

    const display = recomputeSentenceDisplay(database, sentence.id);
    assert.equal(display.displaySpans[0]?.knowledgeState, "known");
    assert.equal(display.displaySpans[2]?.knowledgeState, "unknown");
    assert.equal(display.displaySpans[2]?.showGloss, true);

    const app = createApp(database);
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));

    try {
      const address = server.address();
      assert(address && typeof address === "object");
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const manualSentence = await postJson<{
        id: string;
        text: string;
        approvalStatus: SentenceApprovalStatus;
        audioStatus: AudioStatus;
        linkedWords: Array<{ id: string; simplified: string }>;
        displaySpans: Array<{ text: string; linkedWordId: string | null }>;
      }>(baseUrl, "/words/word-nihao/manual-sentences", {
        text: "\u4f60\u597d\uff0c\u4f60\u5417\uff1f",
        translation: "Hello, you?",
        pinyinFull: "ni3 hao3, ni3 ma5?"
      }, 201);
      assert.equal(manualSentence.approvalStatus, SentenceApprovalStatus.Approved);
      assert.equal(
        [AudioStatus.Pending, AudioStatus.Ready].includes(manualSentence.audioStatus),
        true
      );
      assert.deepEqual(
        manualSentence.linkedWords.map((word) => word.id),
        ["word-nihao", "word-nima"]
      );
      assert.equal(
        manualSentence.displaySpans.some((span) => span.text === "\u4f60\u5417" && span.linkedWordId === "word-nima"),
        true
      );

      const wordDetail = await expectJson<{
        approvedSentences: Array<{ id: string; text: string }>;
      }>(await fetch(`${baseUrl}/words/word-nihao`));
      assert.equal(
        wordDetail.approvedSentences.some((sentenceItem) => sentenceItem.id === manualSentence.id && sentenceItem.text === manualSentence.text),
        true
      );

      const linkedWordDetail = await expectJson<{
        approvedSentences: Array<{ id: string; text: string }>;
      }>(await fetch(`${baseUrl}/words/word-nima`));
      assert.equal(
        linkedWordDetail.approvedSentences.some((sentenceItem) => sentenceItem.id === manualSentence.id),
        true
      );

      await postJson(baseUrl, "/words/word-nihao/sentence-generation-jobs", undefined, 202);
      const generatedCandidate = await waitForSentenceCandidate(baseUrl);
      assert.equal(generatedCandidate.sentence?.approvalStatus, SentenceApprovalStatus.Pending);
      assert.equal(generatedCandidate.sentence?.linkedWords[0]?.id, "word-nihao");

      const regeneratedQueue = await postJson<{
        items: Array<{
          type: QueueItemType;
          sentence?: { text: string };
        }>;
      }>(baseUrl, `/queue/items/${generatedCandidate.id}/actions`, {
        action: "regenerate_sentence_candidate"
      });
      assert.equal(
        regeneratedQueue.items.some((item) => item.type === QueueItemType.SentenceCandidate && item.sentence?.text === generatedCandidate.sentence?.text),
        false
      );

      const replacementCandidate = await waitForSentenceCandidate(baseUrl);
      assert.notEqual(replacementCandidate.sentence?.text, generatedCandidate.sentence?.text);

      await postJson(baseUrl, `/queue/items/${replacementCandidate.id}/actions`, {
        action: "edit_and_approve_sentence_candidate",
        text: "你好！",
        translation: "Hello!",
        pinyinFull: "ni3 hao3!"
      });

      const approvedSentences = await expectJson<{
        items: Array<{
          text: string;
          translation: string | null;
          displaySpans: Array<{ text: string; showGloss: boolean }>;
        }>;
      }>(await fetch(`${baseUrl}/words/word-nihao/sentences`));

      assert(approvedSentences.items.some((item) => item.text === "你好！" && item.translation === "Hello!"));
      assert(approvedSentences.items.every((item) => item.text !== generatedCandidate.sentence?.text));
      assert.equal(
        approvedSentences.items.find((item) => item.text === "你好！")?.displaySpans[0]?.showGloss,
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

    console.log("Ticket 017 manual sentence entry and sentence bank verification passed.");
  } finally {
    database.close();
    fs.rmSync(verificationDatabasePath, { force: true });
  }
}

void main();
