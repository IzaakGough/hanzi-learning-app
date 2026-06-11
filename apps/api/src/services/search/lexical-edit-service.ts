import type Database from "better-sqlite3";
import { ItemSource, ItemStatus, type CharacterDetailRecord, type LexicalEditInput, type WordDetailRecord } from "@hanzi-learning-app/shared";
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

function nextStatusForLexicalEdit(status: ItemStatus, blockedReason: string | null, isComplete: boolean) {
  if (status === ItemStatus.Learned || status === ItemStatus.Archived) {
    return {
      status,
      blockedReason: isComplete && blockedReason === "missing_lexical_data" ? null : blockedReason
    };
  }

  if (isComplete) {
    return {
      status: blockedReason === "missing_lexical_data" || status === ItemStatus.Blocked
        ? ItemStatus.Ready
        : status,
      blockedReason: blockedReason === "missing_lexical_data" ? null : blockedReason
    };
  }

  return {
    status: ItemStatus.Blocked,
    blockedReason: "missing_lexical_data"
  };
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
  const isComplete = !isBlank(nextPinyinDisplay) && !isBlank(nextMeaningPrimary) && split !== null;
  const nextState = nextStatusForLexicalEdit(current.status, current.blockedReason, isComplete);

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
      status = @status,
      blocked_reason = @blockedReason,
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
    status: nextState.status,
    blockedReason: nextState.blockedReason,
    updatedAt: new Date().toISOString()
  });

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
  const isComplete = !isBlank(nextPinyinDisplay) && !isBlank(nextMeaningPrimary);
  const nextState = nextStatusForLexicalEdit(current.status, current.blockedReason, isComplete);

  database.prepare(`
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
  `).run({
    id,
    pinyinDisplay: nextPinyinDisplay,
    pinyinSource: nextPinyinDisplay === current.pinyinDisplay ? current.pinyinSource : ItemSource.Manual,
    pinyinSourceRef: nextPinyinDisplay === current.pinyinDisplay ? current.pinyinSourceRef : input.provenanceNote,
    meaningPrimary: nextMeaningPrimary,
    meaningSource: nextMeaningPrimary === current.meaningPrimary ? current.meaningSource : ItemSource.Manual,
    meaningSourceRef: nextMeaningPrimary === current.meaningPrimary ? current.meaningSourceRef : input.provenanceNote,
    status: nextState.status,
    blockedReason: nextState.blockedReason,
    updatedAt: new Date().toISOString()
  });

  return getWordDetail(database, id);
}

export { InvalidLexicalEditError, SearchEntityNotFoundError };
