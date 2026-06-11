import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  ItemStatus,
  type SentenceAnalysisSpanInput,
  type SentenceAnalysisSpanRecord,
  type SentenceCreateInput,
  type SentenceDetailRecord,
  type SentenceDisplayRecord,
  type SentenceDisplaySpan,
  type SentenceKnownItemSets,
  type SentenceLinkedWordSummary,
  type SentenceRecord,
  type SentenceSpanKnowledgeState
} from "@hanzi-learning-app/shared";

interface SentenceRow {
  id: string;
  text: string;
  translation: string | null;
  pinyin_full: string | null;
  approval_status: SentenceRecord["approvalStatus"];
  audio_status: SentenceRecord["audioStatus"];
  audio_path: string | null;
  generation_source: SentenceRecord["generationSource"];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SentenceLinkedWordRow {
  id: string;
  simplified: string;
  pinyin_display: string | null;
  meaning_primary: string | null;
  status: SentenceLinkedWordSummary["status"];
}

interface SentenceAnalysisSpanRow {
  id: string;
  sentence_id: string;
  sort_order: number;
  text: string;
  span_type: SentenceAnalysisSpanRecord["spanType"];
  linked_word_id: string | null;
  linked_character_id: string | null;
  gloss_text: string | null;
  pinyin_text: string | null;
  created_at: string;
  updated_at: string;
}

export class SentenceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SentenceNotFoundError";
  }
}

function mapSentenceRecord(row: SentenceRow): SentenceRecord {
  return {
    id: row.id,
    text: row.text,
    translation: row.translation,
    pinyinFull: row.pinyin_full,
    approvalStatus: row.approval_status,
    audioStatus: row.audio_status,
    audioPath: row.audio_path,
    generationSource: row.generation_source,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSentenceAnalysisSpanRecord(row: SentenceAnalysisSpanRow): SentenceAnalysisSpanRecord {
  return {
    id: row.id,
    sentenceId: row.sentence_id,
    sortOrder: row.sort_order,
    text: row.text,
    spanType: row.span_type,
    linkedWordId: row.linked_word_id,
    linkedCharacterId: row.linked_character_id,
    glossText: row.gloss_text,
    pinyinText: row.pinyin_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function validateSentenceInput(input: SentenceCreateInput) {
  if (input.text.trim().length === 0) {
    throw new Error("Sentence text is required.");
  }

  const linkedWordIds = new Set<string>();
  for (const link of input.linkedWords) {
    if (linkedWordIds.has(link.wordId)) {
      throw new Error(`Duplicate sentence word link: ${link.wordId}`);
    }

    linkedWordIds.add(link.wordId);
  }

  input.analysisSpans.forEach((span, index) => {
    validateSentenceAnalysisSpanInput(span, linkedWordIds, index);
  });
}

function validateSentenceAnalysisSpanInput(
  span: SentenceAnalysisSpanInput,
  linkedWordIds: Set<string>,
  index: number
) {
  if (span.text.trim().length === 0) {
    throw new Error(`Sentence analysis span ${index} is missing text.`);
  }

  if (span.spanType === "known_word" || span.spanType === "unknown_word") {
    if (!span.linkedWordId) {
      throw new Error(`Sentence analysis span ${index} must link to a word.`);
    }

    if (!linkedWordIds.has(span.linkedWordId)) {
      throw new Error(
        `Sentence analysis span ${index} links to word ${span.linkedWordId} which is not attached to the sentence.`
      );
    }

    if (span.linkedCharacterId) {
      throw new Error(`Sentence analysis span ${index} cannot link to both a word and a character.`);
    }
    return;
  }

  if (span.spanType === "fallback_character") {
    if (!span.linkedCharacterId || span.linkedWordId) {
      throw new Error(`Sentence analysis span ${index} must link only to a character.`);
    }
    return;
  }

  if (span.linkedWordId || span.linkedCharacterId) {
    throw new Error(`Sentence analysis span ${index} punctuation cannot link to an item.`);
  }
}

function getSentenceRow(database: Database.Database, sentenceId: string) {
  return database.prepare(`
    SELECT
      id,
      text,
      translation,
      pinyin_full,
      approval_status,
      audio_status,
      audio_path,
      generation_source,
      notes,
      created_at,
      updated_at
    FROM sentences
    WHERE id = ?
  `).get(sentenceId) as SentenceRow | undefined;
}

function listSentenceLinkedWords(database: Database.Database, sentenceId: string): SentenceLinkedWordSummary[] {
  const rows = database.prepare(`
    SELECT
      w.id,
      w.simplified,
      w.pinyin_display,
      w.meaning_primary,
      w.status
    FROM word_sentences ws
    INNER JOIN words w ON w.id = ws.word_id
    WHERE ws.sentence_id = ?
    ORDER BY ws.sort_order ASC, w.simplified ASC
  `).all(sentenceId) as SentenceLinkedWordRow[];

  return rows.map((row) => ({
    id: row.id,
    simplified: row.simplified,
    pinyinDisplay: row.pinyin_display,
    meaningPrimary: row.meaning_primary,
    status: row.status
  }));
}

function listSentenceAnalysisSpans(
  database: Database.Database,
  sentenceId: string
): SentenceAnalysisSpanRecord[] {
  const rows = database.prepare(`
    SELECT
      id,
      sentence_id,
      sort_order,
      text,
      span_type,
      linked_word_id,
      linked_character_id,
      gloss_text,
      pinyin_text,
      created_at,
      updated_at
    FROM sentence_analysis_spans
    WHERE sentence_id = ?
    ORDER BY sort_order ASC
  `).all(sentenceId) as SentenceAnalysisSpanRow[];

  return rows.map(mapSentenceAnalysisSpanRecord);
}

function requireWordExists(database: Database.Database, wordId: string) {
  const row = database.prepare("SELECT id FROM words WHERE id = ?").get(wordId) as
    | { id: string }
    | undefined;

  if (!row) {
    throw new Error(`Linked word ${wordId} was not found.`);
  }
}

function requireCharacterExists(database: Database.Database, characterId: string) {
  const row = database.prepare("SELECT id FROM characters WHERE id = ?").get(characterId) as
    | { id: string }
    | undefined;

  if (!row) {
    throw new Error(`Linked character ${characterId} was not found.`);
  }
}

export function createSentence(
  database: Database.Database,
  input: SentenceCreateInput
): SentenceDetailRecord {
  validateSentenceInput(input);

  const execute = database.transaction(() => {
    const sentenceId = randomUUID();
    const timestamp = new Date().toISOString();

    database.prepare(`
      INSERT INTO sentences (
        id,
        text,
        translation,
        pinyin_full,
        approval_status,
        audio_status,
        audio_path,
        generation_source,
        notes,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @text,
        @translation,
        @pinyinFull,
        @approvalStatus,
        @audioStatus,
        @audioPath,
        @generationSource,
        @notes,
        @createdAt,
        @updatedAt
      )
    `).run({
      id: sentenceId,
      text: input.text.trim(),
      translation: input.translation,
      pinyinFull: input.pinyinFull,
      approvalStatus: input.approvalStatus,
      audioStatus: input.audioStatus,
      audioPath: input.audioPath,
      generationSource: input.generationSource,
      notes: input.notes,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const insertWordLink = database.prepare(`
      INSERT INTO word_sentences (sentence_id, word_id, sort_order, created_at)
      VALUES (@sentenceId, @wordId, @sortOrder, @createdAt)
    `);
    const insertSpan = database.prepare(`
      INSERT INTO sentence_analysis_spans (
        id,
        sentence_id,
        sort_order,
        text,
        span_type,
        linked_word_id,
        linked_character_id,
        gloss_text,
        pinyin_text,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @sentenceId,
        @sortOrder,
        @text,
        @spanType,
        @linkedWordId,
        @linkedCharacterId,
        @glossText,
        @pinyinText,
        @createdAt,
        @updatedAt
      )
    `);

    for (const link of input.linkedWords) {
      requireWordExists(database, link.wordId);
      insertWordLink.run({
        sentenceId,
        wordId: link.wordId,
        sortOrder: link.sortOrder,
        createdAt: timestamp
      });
    }

    input.analysisSpans.forEach((span, index) => {
      if (span.linkedWordId) {
        requireWordExists(database, span.linkedWordId);
      }

      if (span.linkedCharacterId) {
        requireCharacterExists(database, span.linkedCharacterId);
      }

      insertSpan.run({
        id: randomUUID(),
        sentenceId,
        sortOrder: index,
        text: span.text.trim(),
        spanType: span.spanType,
        linkedWordId: span.linkedWordId,
        linkedCharacterId: span.linkedCharacterId,
        glossText: span.glossText,
        pinyinText: span.pinyinText,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    });

    return getSentenceDetail(database, sentenceId);
  });

  return execute();
}

export function getSentenceDetail(
  database: Database.Database,
  sentenceId: string
): SentenceDetailRecord {
  const row = getSentenceRow(database, sentenceId);

  if (!row) {
    throw new SentenceNotFoundError(`Sentence ${sentenceId} was not found.`);
  }

  return {
    ...mapSentenceRecord(row),
    linkedWords: listSentenceLinkedWords(database, sentenceId),
    analysisSpans: listSentenceAnalysisSpans(database, sentenceId)
  };
}

export function getCurrentKnownSentenceItemSets(database: Database.Database): SentenceKnownItemSets {
  const learnedStatuses = [ItemStatus.Learned];

  const wordIds = (database.prepare(`
    SELECT id
    FROM words
    WHERE status IN (${learnedStatuses.map(() => "?").join(", ")})
      AND archived_at IS NULL
  `).all(...learnedStatuses) as Array<{ id: string }>).map((row) => row.id);

  const characterIds = (database.prepare(`
    SELECT id
    FROM characters
    WHERE status IN (${learnedStatuses.map(() => "?").join(", ")})
      AND archived_at IS NULL
  `).all(...learnedStatuses) as Array<{ id: string }>).map((row) => row.id);

  return {
    wordIds,
    characterIds
  };
}

function getSentenceSpanKnowledgeState(
  span: SentenceAnalysisSpanRecord,
  knownWordIds: Set<string>,
  knownCharacterIds: Set<string>
): SentenceSpanKnowledgeState {
  if (span.spanType === "punctuation") {
    return "neutral";
  }

  if (span.spanType === "known_word" || span.spanType === "unknown_word") {
    return span.linkedWordId && knownWordIds.has(span.linkedWordId) ? "known" : "unknown";
  }

  return span.linkedCharacterId && knownCharacterIds.has(span.linkedCharacterId) ? "known" : "unknown";
}

function mapSentenceDisplaySpan(
  span: SentenceAnalysisSpanRecord,
  knowledgeState: SentenceSpanKnowledgeState
): SentenceDisplaySpan {
  const shouldShowAnnotations = knowledgeState === "unknown";

  return {
    ...span,
    knowledgeState,
    showGloss: shouldShowAnnotations && span.glossText != null,
    showPinyin: shouldShowAnnotations && span.pinyinText != null
  };
}

export function recomputeSentenceDisplay(
  database: Database.Database,
  sentenceId: string,
  knownItemSets: SentenceKnownItemSets = getCurrentKnownSentenceItemSets(database)
): SentenceDisplayRecord {
  const detail = getSentenceDetail(database, sentenceId);
  const knownWordIds = new Set(knownItemSets.wordIds);
  const knownCharacterIds = new Set(knownItemSets.characterIds);

  return {
    ...detail,
    displaySpans: detail.analysisSpans.map((span) =>
      mapSentenceDisplaySpan(
        span,
        getSentenceSpanKnowledgeState(span, knownWordIds, knownCharacterIds)
      )
    )
  };
}
