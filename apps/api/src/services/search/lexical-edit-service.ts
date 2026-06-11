import type Database from "better-sqlite3";
import { ItemSource, type CharacterDetailRecord, type LexicalEditInput, type WordDetailRecord } from "@hanzi-learning-app/shared";
import { syncLearningStatuses } from "../learning/level-progression-service.js";
import { splitNumberedPinyinSyllable } from "../lexical/pinyin.js";
import { getCharacterDetail, getWordDetail, SearchEntityNotFoundError } from "./search-service.js";

function isBlank(value: string | null) {
  return value == null || value.trim().length === 0;
}

class InvalidLexicalEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLexicalEditError";
  }
}

export function updateCharacterLexical(
  database: Database.Database,
  id: string,
  input: LexicalEditInput
): CharacterDetailRecord {
  const current = getCharacterDetail(database, id);
  const split = !isBlank(input.pinyinDisplay)
    ? splitNumberedPinyinSyllable(input.pinyinDisplay!)
    : null;

  if (!isBlank(input.pinyinDisplay) && split === null) {
    throw new InvalidLexicalEditError("Character pinyin must be a single numbered syllable such as ni3.");
  }

  const nextPinyinDisplay = input.pinyinDisplay;
  const nextMeaningPrimary = input.meaningPrimary;

  database.prepare(`
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
      updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id,
    pinyinDisplay: nextPinyinDisplay,
    pinyinSource: nextPinyinDisplay === current.pinyinDisplay ? current.pinyinSource : ItemSource.Manual,
    pinyinSourceRef: nextPinyinDisplay === current.pinyinDisplay ? current.pinyinSourceRef : input.provenanceNote,
    pinyinInitial: split?.initial ?? null,
    pinyinFinal: split?.final ?? null,
    tone: split?.tone ?? null,
    meaningPrimary: nextMeaningPrimary,
    meaningSource: nextMeaningPrimary === current.meaningPrimary ? current.meaningSource : ItemSource.Manual,
    meaningSourceRef: nextMeaningPrimary === current.meaningPrimary ? current.meaningSourceRef : input.provenanceNote,
    updatedAt: new Date().toISOString()
  });

  syncLearningStatuses(database);
  return getCharacterDetail(database, id);
}

export function updateWordLexical(
  database: Database.Database,
  id: string,
  input: LexicalEditInput
): WordDetailRecord {
  const current = getWordDetail(database, id);
  const nextPinyinDisplay = input.pinyinDisplay;
  const nextMeaningPrimary = input.meaningPrimary;

  database.prepare(`
    UPDATE words
    SET
      pinyin_display = @pinyinDisplay,
      pinyin_source = @pinyinSource,
      pinyin_source_ref = @pinyinSourceRef,
      meaning_primary = @meaningPrimary,
      meaning_source = @meaningSource,
      meaning_source_ref = @meaningSourceRef,
      updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id,
    pinyinDisplay: nextPinyinDisplay,
    pinyinSource: nextPinyinDisplay === current.pinyinDisplay ? current.pinyinSource : ItemSource.Manual,
    pinyinSourceRef: nextPinyinDisplay === current.pinyinDisplay ? current.pinyinSourceRef : input.provenanceNote,
    meaningPrimary: nextMeaningPrimary,
    meaningSource: nextMeaningPrimary === current.meaningPrimary ? current.meaningSource : ItemSource.Manual,
    meaningSourceRef: nextMeaningPrimary === current.meaningPrimary ? current.meaningSourceRef : input.provenanceNote,
    updatedAt: new Date().toISOString()
  });

  syncLearningStatuses(database);
  return getWordDetail(database, id);
}

export { InvalidLexicalEditError, SearchEntityNotFoundError };
