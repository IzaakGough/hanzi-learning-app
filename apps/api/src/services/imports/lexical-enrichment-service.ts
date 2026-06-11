import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { ItemSource, ItemStatus, type ImportDiagnostic } from "@hanzi-learning-app/shared";
import { repoRoot } from "../../imports/paths.js";
import { splitNumberedPinyinSyllable } from "../lexical/pinyin.js";

interface CharacterLexicalRow {
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
  status: ItemStatus;
  blocked_reason: string | null;
  source: ItemSource;
  source_ref: string | null;
}

interface WordLexicalRow {
  id: string;
  simplified: string;
  pinyin_display: string | null;
  pinyin_source: ItemSource | null;
  pinyin_source_ref: string | null;
  meaning_primary: string | null;
  meaning_source: ItemSource | null;
  meaning_source_ref: string | null;
  status: ItemStatus;
  blocked_reason: string | null;
  source: ItemSource;
  source_ref: string | null;
}

interface LexicalDictionaryEntry {
  text: string;
  pinyinDisplay: string;
  meaningPrimary: string;
}

interface LexicalDictionaryFile {
  sourceName: string;
  characters: LexicalDictionaryEntry[];
  words: LexicalDictionaryEntry[];
}

interface LexicalDictionary {
  sourceName: string;
  characterMap: Map<string, LexicalDictionaryEntry>;
  wordMap: Map<string, LexicalDictionaryEntry>;
}

export interface LexicalEnrichmentResult {
  diagnostics: ImportDiagnostic[];
  updatedCount: number;
}

const lexicalDictionaryPath = path.join(
  repoRoot,
  "data",
  "imports",
  "examples",
  "lexical_dictionary.json"
);

const missingLexicalDataReason = "missing_lexical_data";

let cachedDictionary: LexicalDictionary | null = null;

function isBlank(value: string | null | undefined) {
  return value == null || value.trim().length === 0;
}

function loadDictionary() {
  if (cachedDictionary) {
    return cachedDictionary;
  }

  const raw = fs.readFileSync(lexicalDictionaryPath, "utf8");
  const parsed = JSON.parse(raw) as LexicalDictionaryFile;

  cachedDictionary = {
    sourceName: parsed.sourceName,
    characterMap: new Map(parsed.characters.map((entry) => [entry.text, entry])),
    wordMap: new Map(parsed.words.map((entry) => [entry.text, entry]))
  };

  return cachedDictionary;
}

function getBackfilledSource(
  source: ItemSource | null,
  sourceRef: string | null,
  recordSource: ItemSource,
  recordSourceRef: string | null,
  value: string | null
) {
  if (isBlank(value) || source !== null) {
    return { source, sourceRef };
  }

  return {
    source: recordSource,
    sourceRef: recordSourceRef
  };
}

function enrichCharacters(database: Database.Database, diagnostics: ImportDiagnostic[]) {
  const dictionary = loadDictionary();
  const rows = database.prepare(`
    SELECT
      id,
      hanzi,
      pinyin_display,
      pinyin_source,
      pinyin_source_ref,
      pinyin_initial,
      pinyin_final,
      tone,
      meaning_primary,
      meaning_source,
      meaning_source_ref,
      status,
      blocked_reason,
      source,
      source_ref
    FROM characters
  `).all() as CharacterLexicalRow[];

  const updateStatement = database.prepare(`
    UPDATE characters
    SET
      pinyin_display = @pinyinDisplay,
      pinyin_source = @pinyinSource,
      pinyin_source_ref = @pinyinSourceRef,
      pinyin_initial = @pinyinInitial,
      pinyin_final = @pinyinFinal,
      tone = @tone,
      meaning_primary = @meaningPrimary,
      meaning_source = @meaningSource,
      meaning_source_ref = @meaningSourceRef,
      status = @status,
      blocked_reason = @blockedReason,
      updated_at = @updatedAt
    WHERE id = @id
  `);

  let updatedCount = 0;

  for (const row of rows) {
    let nextPinyinDisplay = row.pinyin_display;
    let nextPinyinSource = row.pinyin_source;
    let nextPinyinSourceRef = row.pinyin_source_ref;
    let nextMeaningPrimary = row.meaning_primary;
    let nextMeaningSource = row.meaning_source;
    let nextMeaningSourceRef = row.meaning_source_ref;
    let nextPinyinInitial = row.pinyin_initial;
    let nextPinyinFinal = row.pinyin_final;
    let nextTone = row.tone;
    let nextStatus = row.status;
    let nextBlockedReason = row.blocked_reason;

    const dictionaryEntry = dictionary.characterMap.get(row.hanzi);

    if (isBlank(nextPinyinDisplay) && row.source !== ItemSource.Manual && dictionaryEntry) {
      nextPinyinDisplay = dictionaryEntry.pinyinDisplay;
      nextPinyinSource = ItemSource.Derived;
      nextPinyinSourceRef = dictionary.sourceName;
    }

    if (isBlank(nextMeaningPrimary) && row.source !== ItemSource.Manual && dictionaryEntry) {
      nextMeaningPrimary = dictionaryEntry.meaningPrimary;
      nextMeaningSource = ItemSource.Derived;
      nextMeaningSourceRef = dictionary.sourceName;
    }

    const nextPinyinProvenance = getBackfilledSource(
      nextPinyinSource,
      nextPinyinSourceRef,
      row.source,
      row.source_ref,
      nextPinyinDisplay
    );

    nextPinyinSource = nextPinyinProvenance.source;
    nextPinyinSourceRef = nextPinyinProvenance.sourceRef;

    const nextMeaningProvenance = getBackfilledSource(
      nextMeaningSource,
      nextMeaningSourceRef,
      row.source,
      row.source_ref,
      nextMeaningPrimary
    );

    nextMeaningSource = nextMeaningProvenance.source;
    nextMeaningSourceRef = nextMeaningProvenance.sourceRef;

    if (
      !isBlank(nextPinyinDisplay) &&
      (isBlank(nextPinyinInitial) || isBlank(nextPinyinFinal) || isBlank(nextTone))
    ) {
      const split = splitNumberedPinyinSyllable(nextPinyinDisplay!);

      if (split) {
        nextPinyinInitial = split.initial;
        nextPinyinFinal = split.final;
        nextTone = split.tone;
      }
    }

    const missingFields: string[] = [];

    if (isBlank(nextPinyinDisplay)) {
      missingFields.push("pinyinDisplay");
    }

    if (isBlank(nextPinyinInitial)) {
      missingFields.push("pinyinInitial");
    }

    if (isBlank(nextPinyinFinal)) {
      missingFields.push("pinyinFinal");
    }

    if (isBlank(nextTone)) {
      missingFields.push("tone");
    }

    if (isBlank(nextMeaningPrimary)) {
      missingFields.push("meaningPrimary");
    }

    if (missingFields.length > 0) {
      if (row.status !== ItemStatus.Learned && row.status !== ItemStatus.Archived) {
        nextStatus = ItemStatus.Blocked;
      }

      nextBlockedReason = missingLexicalDataReason;
      diagnostics.push({
        severity: "warning",
        code: "character_missing_lexical_data",
        message: `Character ${row.hanzi} is missing lexical data: ${missingFields.join(", ")}.`,
        entityType: "character",
        entityKey: row.hanzi
      });
    } else if (nextBlockedReason === missingLexicalDataReason) {
      nextBlockedReason = null;
    }

    const shouldUpdate =
      nextPinyinDisplay !== row.pinyin_display ||
      nextPinyinSource !== row.pinyin_source ||
      nextPinyinSourceRef !== row.pinyin_source_ref ||
      nextPinyinInitial !== row.pinyin_initial ||
      nextPinyinFinal !== row.pinyin_final ||
      nextTone !== row.tone ||
      nextMeaningPrimary !== row.meaning_primary ||
      nextMeaningSource !== row.meaning_source ||
      nextMeaningSourceRef !== row.meaning_source_ref ||
      nextStatus !== row.status ||
      nextBlockedReason !== row.blocked_reason;

    if (!shouldUpdate) {
      continue;
    }

    updateStatement.run({
      id: row.id,
      pinyinDisplay: nextPinyinDisplay,
      pinyinSource: nextPinyinSource,
      pinyinSourceRef: nextPinyinSourceRef,
      pinyinInitial: nextPinyinInitial,
      pinyinFinal: nextPinyinFinal,
      tone: nextTone,
      meaningPrimary: nextMeaningPrimary,
      meaningSource: nextMeaningSource,
      meaningSourceRef: nextMeaningSourceRef,
      status: nextStatus,
      blockedReason: nextBlockedReason,
      updatedAt: new Date().toISOString()
    });

    updatedCount += 1;
  }

  return updatedCount;
}

function enrichWords(database: Database.Database, diagnostics: ImportDiagnostic[]) {
  const dictionary = loadDictionary();
  const rows = database.prepare(`
    SELECT
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
      source,
      source_ref
    FROM words
  `).all() as WordLexicalRow[];

  const updateStatement = database.prepare(`
    UPDATE words
    SET
      pinyin_display = @pinyinDisplay,
      pinyin_source = @pinyinSource,
      pinyin_source_ref = @pinyinSourceRef,
      meaning_primary = @meaningPrimary,
      meaning_source = @meaningSource,
      meaning_source_ref = @meaningSourceRef,
      status = @status,
      blocked_reason = @blockedReason,
      updated_at = @updatedAt
    WHERE id = @id
  `);

  let updatedCount = 0;

  for (const row of rows) {
    let nextPinyinDisplay = row.pinyin_display;
    let nextPinyinSource = row.pinyin_source;
    let nextPinyinSourceRef = row.pinyin_source_ref;
    let nextMeaningPrimary = row.meaning_primary;
    let nextMeaningSource = row.meaning_source;
    let nextMeaningSourceRef = row.meaning_source_ref;
    let nextStatus = row.status;
    let nextBlockedReason = row.blocked_reason;

    const dictionaryEntry = dictionary.wordMap.get(row.simplified);

    if (isBlank(nextPinyinDisplay) && row.source !== ItemSource.Manual && dictionaryEntry) {
      nextPinyinDisplay = dictionaryEntry.pinyinDisplay;
      nextPinyinSource = ItemSource.Derived;
      nextPinyinSourceRef = dictionary.sourceName;
    }

    if (isBlank(nextMeaningPrimary) && row.source !== ItemSource.Manual && dictionaryEntry) {
      nextMeaningPrimary = dictionaryEntry.meaningPrimary;
      nextMeaningSource = ItemSource.Derived;
      nextMeaningSourceRef = dictionary.sourceName;
    }

    const nextPinyinProvenance = getBackfilledSource(
      nextPinyinSource,
      nextPinyinSourceRef,
      row.source,
      row.source_ref,
      nextPinyinDisplay
    );

    nextPinyinSource = nextPinyinProvenance.source;
    nextPinyinSourceRef = nextPinyinProvenance.sourceRef;

    const nextMeaningProvenance = getBackfilledSource(
      nextMeaningSource,
      nextMeaningSourceRef,
      row.source,
      row.source_ref,
      nextMeaningPrimary
    );

    nextMeaningSource = nextMeaningProvenance.source;
    nextMeaningSourceRef = nextMeaningProvenance.sourceRef;

    const missingFields: string[] = [];

    if (isBlank(nextPinyinDisplay)) {
      missingFields.push("pinyinDisplay");
    }

    if (isBlank(nextMeaningPrimary)) {
      missingFields.push("meaningPrimary");
    }

    if (missingFields.length > 0) {
      if (row.status !== ItemStatus.Learned && row.status !== ItemStatus.Archived) {
        nextStatus = ItemStatus.Blocked;
      }

      nextBlockedReason = missingLexicalDataReason;
      diagnostics.push({
        severity: "warning",
        code: "word_missing_lexical_data",
        message: `Word ${row.simplified} is missing lexical data: ${missingFields.join(", ")}.`,
        entityType: "word",
        entityKey: row.simplified
      });
    } else {
      if (
        row.status === ItemStatus.Blocked &&
        (row.blocked_reason === null || row.blocked_reason === missingLexicalDataReason)
      ) {
        nextStatus = ItemStatus.Ready;
      }

      if (nextBlockedReason === missingLexicalDataReason) {
        nextBlockedReason = null;
      }
    }

    const shouldUpdate =
      nextPinyinDisplay !== row.pinyin_display ||
      nextPinyinSource !== row.pinyin_source ||
      nextPinyinSourceRef !== row.pinyin_source_ref ||
      nextMeaningPrimary !== row.meaning_primary ||
      nextMeaningSource !== row.meaning_source ||
      nextMeaningSourceRef !== row.meaning_source_ref ||
      nextStatus !== row.status ||
      nextBlockedReason !== row.blocked_reason;

    if (!shouldUpdate) {
      continue;
    }

    updateStatement.run({
      id: row.id,
      pinyinDisplay: nextPinyinDisplay,
      pinyinSource: nextPinyinSource,
      pinyinSourceRef: nextPinyinSourceRef,
      meaningPrimary: nextMeaningPrimary,
      meaningSource: nextMeaningSource,
      meaningSourceRef: nextMeaningSourceRef,
      status: nextStatus,
      blockedReason: nextBlockedReason,
      updatedAt: new Date().toISOString()
    });

    updatedCount += 1;
  }

  return updatedCount;
}

export function runLexicalEnrichment(database: Database.Database): LexicalEnrichmentResult {
  const diagnostics: ImportDiagnostic[] = [];
  const updatedCount = enrichCharacters(database, diagnostics) + enrichWords(database, diagnostics);

  return {
    diagnostics,
    updatedCount
  };
}
