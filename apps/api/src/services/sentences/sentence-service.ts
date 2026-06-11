import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  ItemStatus,
  SentenceApprovalStatus,
  type SentenceAnalysisSpanInput,
  type SentenceAnalysisSpanRecord,
  type SentenceCreateInput,
  type SentenceDetailRecord,
  type SentenceDisplayRecord,
  type SentenceDisplaySpan,
  type SentenceKnownItemSets,
  type SentenceLinkedWordSummary,
  type SentenceRecord,
  type SentenceSpanKnowledgeState,
  type SentenceWordLinkInput
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

const punctuationCharacters = new Set(["。", "，", "！", "？", "；", "：", "、", "（", "）", "“", "”", "《", "》"]);

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

function listSentenceWordLinks(
  database: Database.Database,
  sentenceId: string
): SentenceWordLinkInput[] {
  return (database.prepare(`
    SELECT word_id, sort_order
    FROM word_sentences
    WHERE sentence_id = ?
    ORDER BY sort_order ASC
  `).all(sentenceId) as Array<{ word_id: string; sort_order: number }>).map((row) => ({
    wordId: row.word_id,
    sortOrder: row.sort_order
  }));
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

function requireSentenceDetail(database: Database.Database, sentenceId: string) {
  return getSentenceDetail(database, sentenceId);
}

function assertSentencePending(sentence: SentenceDetailRecord) {
  if (sentence.approvalStatus !== SentenceApprovalStatus.Pending) {
    throw new Error(`Sentence ${sentence.id} is not pending approval.`);
  }
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

function listLinkedWordRecords(database: Database.Database, linkedWords: SentenceWordLinkInput[]) {
  if (linkedWords.length === 0) {
    throw new Error("Sentence candidates must link at least one word.");
  }

  return linkedWords.map((link) => {
    const row = database.prepare(`
      SELECT id, simplified, pinyin_display, meaning_primary
      FROM words
      WHERE id = ?
    `).get(link.wordId) as
      | { id: string; simplified: string; pinyin_display: string | null; meaning_primary: string | null }
      | undefined;

    if (!row) {
      throw new Error(`Linked word ${link.wordId} was not found.`);
    }

    return row;
  });
}

function getCharacterIdByHanzi(database: Database.Database, hanzi: string) {
  const row = database.prepare(`
    SELECT id
    FROM characters
    WHERE hanzi = ?
  `).get(hanzi) as { id: string } | undefined;

  return row?.id ?? null;
}

function buildSentenceAnalysisSpans(
  database: Database.Database,
  text: string,
  linkedWords: SentenceWordLinkInput[]
): SentenceAnalysisSpanInput[] {
  const normalizedText = text.trim();
  if (normalizedText.length === 0) {
    throw new Error("Sentence text is required.");
  }

  const wordRecords = listLinkedWordRecords(database, linkedWords)
    .sort((left, right) => right.simplified.length - left.simplified.length);

  const spans: SentenceAnalysisSpanInput[] = [];
  let index = 0;

  while (index < normalizedText.length) {
    const remainder = normalizedText.slice(index);
    const matchingWord = wordRecords.find((word) => remainder.startsWith(word.simplified));

    if (matchingWord) {
      spans.push({
        text: matchingWord.simplified,
        spanType: "unknown_word",
        linkedWordId: matchingWord.id,
        linkedCharacterId: null,
        glossText: matchingWord.meaning_primary,
        pinyinText: matchingWord.pinyin_display
      });
      index += matchingWord.simplified.length;
      continue;
    }

    const character = normalizedText[index] ?? "";
    if (punctuationCharacters.has(character)) {
      spans.push({
        text: character,
        spanType: "punctuation",
        linkedWordId: null,
        linkedCharacterId: null,
        glossText: null,
        pinyinText: null
      });
      index += 1;
      continue;
    }

    const linkedCharacterId = getCharacterIdByHanzi(database, character);
    if (!linkedCharacterId) {
      throw new Error(`Sentence text contains unsupported character "${character}" for automatic analysis.`);
    }

    const characterRow = database.prepare(`
      SELECT meaning_primary, pinyin_display
      FROM characters
      WHERE id = ?
    `).get(linkedCharacterId) as { meaning_primary: string | null; pinyin_display: string | null };

    spans.push({
      text: character,
      spanType: "fallback_character",
      linkedWordId: null,
      linkedCharacterId,
      glossText: characterRow.meaning_primary,
      pinyinText: characterRow.pinyin_display
    });
    index += 1;
  }

  return spans;
}

function replaceSentenceContent(
  database: Database.Database,
  sentenceId: string,
  input: Pick<SentenceCreateInput, "text" | "translation" | "pinyinFull">,
  linkedWords: SentenceWordLinkInput[]
) {
  const now = new Date().toISOString();
  const analysisSpans = buildSentenceAnalysisSpans(database, input.text, linkedWords);

  const run = database.transaction(() => {
    database.prepare(`
      UPDATE sentences
      SET text = @text,
          translation = @translation,
          pinyin_full = @pinyinFull,
          updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id: sentenceId,
      text: input.text.trim(),
      translation: input.translation,
      pinyinFull: input.pinyinFull,
      updatedAt: now
    });

    database.prepare(`
      DELETE FROM sentence_analysis_spans
      WHERE sentence_id = ?
    `).run(sentenceId);

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

    analysisSpans.forEach((span, sortOrder) => {
      insertSpan.run({
        id: randomUUID(),
        sentenceId,
        sortOrder,
        text: span.text,
        spanType: span.spanType,
        linkedWordId: span.linkedWordId,
        linkedCharacterId: span.linkedCharacterId,
        glossText: span.glossText,
        pinyinText: span.pinyinText,
        createdAt: now,
        updatedAt: now
      });
    });
  });

  run();
}

export function approveSentenceCandidate(database: Database.Database, sentenceId: string) {
  const sentence = requireSentenceDetail(database, sentenceId);
  assertSentencePending(sentence);

  const now = new Date().toISOString();
  database.prepare(`
    UPDATE sentences
    SET approval_status = ?, updated_at = ?
    WHERE id = ?
  `).run(SentenceApprovalStatus.Approved, now, sentenceId);

  return getSentenceDetail(database, sentenceId);
}

export function rejectSentenceCandidate(database: Database.Database, sentenceId: string) {
  const sentence = requireSentenceDetail(database, sentenceId);
  assertSentencePending(sentence);

  const now = new Date().toISOString();
  database.prepare(`
    UPDATE sentences
    SET approval_status = ?, updated_at = ?
    WHERE id = ?
  `).run(SentenceApprovalStatus.Rejected, now, sentenceId);

  return getSentenceDetail(database, sentenceId);
}

export function editAndApproveSentenceCandidate(
  database: Database.Database,
  sentenceId: string,
  input: Pick<SentenceCreateInput, "text" | "translation" | "pinyinFull">
) {
  const sentence = requireSentenceDetail(database, sentenceId);
  assertSentencePending(sentence);
  const linkedWords = listSentenceWordLinks(database, sentenceId);

  replaceSentenceContent(database, sentenceId, input, linkedWords);
  return approveSentenceCandidate(database, sentenceId);
}

export function listApprovedSentencesForWord(
  database: Database.Database,
  wordId: string
): SentenceDisplayRecord[] {
  const word = database.prepare(`
    SELECT id
    FROM words
    WHERE id = ?
  `).get(wordId) as { id: string } | undefined;

  if (!word) {
    throw new SentenceNotFoundError(`Word ${wordId} was not found.`);
  }

  const sentenceIds = (database.prepare(`
    SELECT s.id
    FROM word_sentences ws
    INNER JOIN sentences s ON s.id = ws.sentence_id
    WHERE ws.word_id = ?
      AND s.approval_status = ?
    ORDER BY s.created_at DESC, s.text ASC
  `).all(wordId, SentenceApprovalStatus.Approved) as Array<{ id: string }>).map((row) => row.id);

  return sentenceIds.map((sentenceId) => recomputeSentenceDisplay(database, sentenceId));
}

export function buildGeneratedSentenceDraft(
  database: Database.Database,
  linkedWords: SentenceWordLinkInput[],
  variantIndex: number
): Pick<SentenceCreateInput, "text" | "translation" | "pinyinFull" | "linkedWords" | "analysisSpans"> {
  const [primaryWord] = listLinkedWordRecords(database, linkedWords);
  const variants = [
    `${primaryWord.simplified}。`,
    `${primaryWord.simplified}！`,
    `${primaryWord.simplified}？`,
    `${primaryWord.simplified}，${primaryWord.simplified}。`
  ];
  const text = variants[variantIndex % variants.length] ?? `${primaryWord.simplified}。`;

  return {
    text,
    translation: primaryWord.meaning_primary,
    pinyinFull: primaryWord.pinyin_display,
    linkedWords,
    analysisSpans: buildSentenceAnalysisSpans(database, text, linkedWords)
  };
}
