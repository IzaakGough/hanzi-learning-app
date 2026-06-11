import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AudioStatus,
  ItemSource,
  ItemStatus,
  SentenceApprovalStatus
} from "@hanzi-learning-app/shared";

const verificationDatabasePath = path.join(
  os.tmpdir(),
  `hanzi-ticket-014-sentences-${Date.now()}.sqlite`
);

async function main() {
  process.env.HANZI_DB_PATH = verificationDatabasePath;
  fs.rmSync(verificationDatabasePath, { force: true });

  const { createDatabaseConnection } = await import("./db/connection.js");
  const { runMigrations } = await import("./db/migrate.js");
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
    assert.equal(storedSentence.analysisSpans[0]?.linkedWordId, "word-nihao");
    assert.equal(storedSentence.analysisSpans[2]?.linkedWordId, "word-nima");
    assert.equal(storedSentence.analysisSpans[3]?.linkedCharacterId, "char-ne");

    const display = recomputeSentenceDisplay(database, sentence.id);
    assert.deepEqual(
      display.displaySpans.map((span) => ({
        text: span.text,
        knowledgeState: span.knowledgeState,
        showGloss: span.showGloss,
        showPinyin: span.showPinyin
      })),
      [
        {
          text: "你好",
          knowledgeState: "known",
          showGloss: false,
          showPinyin: false
        },
        {
          text: "，",
          knowledgeState: "neutral",
          showGloss: false,
          showPinyin: false
        },
        {
          text: "你吗",
          knowledgeState: "unknown",
          showGloss: true,
          showPinyin: true
        },
        {
          text: "呢",
          knowledgeState: "known",
          showGloss: false,
          showPinyin: false
        },
        {
          text: "？",
          knowledgeState: "neutral",
          showGloss: false,
          showPinyin: false
        }
      ]
    );

    const overriddenKnownSets = recomputeSentenceDisplay(database, sentence.id, {
      wordIds: [],
      characterIds: []
    });
    assert.equal(overriddenKnownSets.displaySpans[0]?.knowledgeState, "unknown");
    assert.equal(overriddenKnownSets.displaySpans[0]?.showGloss, true);
    assert.equal(overriddenKnownSets.displaySpans[3]?.knowledgeState, "unknown");

    console.log("Ticket 014 sentence schema and analysis verification passed.");
  } finally {
    database.close();
    fs.rmSync(verificationDatabasePath, { force: true });
  }
}

void main();
