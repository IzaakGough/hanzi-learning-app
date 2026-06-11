import type Database from "better-sqlite3";
import {
  type CharacterDetailRecord,
  type CharacterLinkWord,
  type CharacterRecord,
  type SearchResultItem,
  type WordComponentCharacter,
  type WordDetailRecord,
  type WordRecord
} from "@hanzi-learning-app/shared";

interface SearchRow {
  id: string;
  kind: "character" | "word";
  text: string;
  pinyin_display: string | null;
  meaning_primary: string | null;
  status: CharacterRecord["status"];
  source: CharacterRecord["source"];
}

interface CharacterLinkWordRow {
  id: string;
  simplified: string;
  pinyin_display: string | null;
  meaning_primary: string | null;
  status: CharacterLinkWord["status"];
}

interface WordComponentCharacterRow {
  id: string;
  hanzi: string;
  pinyin_display: string | null;
  meaning_primary: string | null;
  status: WordComponentCharacter["status"];
}

class SearchEntityNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchEntityNotFoundError";
  }
}

function mapCharacterRecord(row: Record<string, unknown>): CharacterRecord {
  return {
    id: row.id as string,
    hanzi: row.hanzi as string,
    pinyinDisplay: row.pinyin_display as string | null,
    pinyinSource: row.pinyin_source as CharacterRecord["pinyinSource"],
    pinyinSourceRef: row.pinyin_source_ref as string | null,
    pinyinInitial: row.pinyin_initial as string | null,
    pinyinFinal: row.pinyin_final as string | null,
    tone: row.tone as string | null,
    meaningPrimary: row.meaning_primary as string | null,
    meaningSource: row.meaning_source as CharacterRecord["meaningSource"],
    meaningSourceRef: row.meaning_source_ref as string | null,
    meaningsOtherJson: row.meanings_other_json as string | null,
    status: row.status as CharacterRecord["status"],
    blockedReason: row.blocked_reason as string | null,
    learnedAt: row.learned_at as string | null,
    archivedAt: row.archived_at as string | null,
    source: row.source as CharacterRecord["source"],
    sourceRef: row.source_ref as string | null,
    levelId: row.level_id as string | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}

function mapWordRecord(row: Record<string, unknown>): WordRecord {
  return {
    id: row.id as string,
    simplified: row.simplified as string,
    pinyinDisplay: row.pinyin_display as string | null,
    pinyinSource: row.pinyin_source as WordRecord["pinyinSource"],
    pinyinSourceRef: row.pinyin_source_ref as string | null,
    meaningPrimary: row.meaning_primary as string | null,
    meaningSource: row.meaning_source as WordRecord["meaningSource"],
    meaningSourceRef: row.meaning_source_ref as string | null,
    meaningsOtherJson: row.meanings_other_json as string | null,
    status: row.status as WordRecord["status"],
    blockedReason: row.blocked_reason as string | null,
    learnedAt: row.learned_at as string | null,
    archivedAt: row.archived_at as string | null,
    source: row.source as WordRecord["source"],
    sourceRef: row.source_ref as string | null,
    levelId: row.level_id as string | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}

export function searchItems(database: Database.Database, rawQuery: string): SearchResultItem[] {
  const query = rawQuery.trim();

  if (query.length === 0) {
    return [];
  }

  const likeQuery = `%${query}%`;
  const lowerLikeQuery = `%${query.toLowerCase()}%`;
  const exactLowerQuery = query.toLowerCase();

  const rows = database.prepare(`
    SELECT
      id,
      kind,
      text,
      pinyin_display,
      meaning_primary,
      status,
      source
    FROM (
      SELECT
        id,
        'character' AS kind,
        hanzi AS text,
        pinyin_display,
        meaning_primary,
        status,
        source,
        CASE
          WHEN hanzi = @query THEN 0
          WHEN lower(COALESCE(pinyin_display, '')) = @exactLowerQuery THEN 1
          WHEN lower(COALESCE(meaning_primary, '')) = @exactLowerQuery THEN 2
          WHEN hanzi LIKE @likeQuery THEN 3
          WHEN lower(COALESCE(pinyin_display, '')) LIKE @lowerLikeQuery THEN 4
          WHEN lower(COALESCE(meaning_primary, '')) LIKE @lowerLikeQuery THEN 5
          ELSE 6
        END AS match_rank
      FROM characters
      WHERE
        hanzi LIKE @likeQuery
        OR lower(COALESCE(pinyin_display, '')) LIKE @lowerLikeQuery
        OR lower(COALESCE(meaning_primary, '')) LIKE @lowerLikeQuery

      UNION ALL

      SELECT
        id,
        'word' AS kind,
        simplified AS text,
        pinyin_display,
        meaning_primary,
        status,
        source,
        CASE
          WHEN simplified = @query THEN 0
          WHEN lower(COALESCE(pinyin_display, '')) = @exactLowerQuery THEN 1
          WHEN lower(COALESCE(meaning_primary, '')) = @exactLowerQuery THEN 2
          WHEN simplified LIKE @likeQuery THEN 3
          WHEN lower(COALESCE(pinyin_display, '')) LIKE @lowerLikeQuery THEN 4
          WHEN lower(COALESCE(meaning_primary, '')) LIKE @lowerLikeQuery THEN 5
          ELSE 6
        END AS match_rank
      FROM words
      WHERE
        simplified LIKE @likeQuery
        OR lower(COALESCE(pinyin_display, '')) LIKE @lowerLikeQuery
        OR lower(COALESCE(meaning_primary, '')) LIKE @lowerLikeQuery
    )
    ORDER BY match_rank ASC, length(text) ASC, text ASC
    LIMIT 30
  `).all({
    query,
    likeQuery,
    lowerLikeQuery,
    exactLowerQuery
  }) as SearchRow[];

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    text: row.text,
    pinyinDisplay: row.pinyin_display,
    meaningPrimary: row.meaning_primary,
    status: row.status,
    source: row.source
  }));
}

export function getCharacterDetail(database: Database.Database, id: string): CharacterDetailRecord {
  const row = database.prepare("SELECT * FROM characters WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;

  if (!row) {
    throw new SearchEntityNotFoundError(`Character ${id} was not found.`);
  }

  const linkedWords = database.prepare(`
    SELECT DISTINCT
      w.id,
      w.simplified,
      w.pinyin_display,
      w.meaning_primary,
      w.status
    FROM word_characters wc
    INNER JOIN words w ON w.id = wc.word_id
    WHERE wc.character_id = ?
    ORDER BY w.simplified ASC
  `).all(id) as CharacterLinkWordRow[];

  return {
    ...mapCharacterRecord(row),
    linkedWords: linkedWords.map((linkedWord) => ({
      id: linkedWord.id,
      simplified: linkedWord.simplified,
      pinyinDisplay: linkedWord.pinyin_display,
      meaningPrimary: linkedWord.meaning_primary,
      status: linkedWord.status
    }))
  };
}

export function getWordDetail(database: Database.Database, id: string): WordDetailRecord {
  const row = database.prepare("SELECT * FROM words WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;

  if (!row) {
    throw new SearchEntityNotFoundError(`Word ${id} was not found.`);
  }

  const componentCharacters = database.prepare(`
    SELECT
      c.id,
      c.hanzi,
      c.pinyin_display,
      c.meaning_primary,
      c.status
    FROM word_characters wc
    INNER JOIN characters c ON c.id = wc.character_id
    WHERE wc.word_id = ?
    ORDER BY wc.sort_order ASC
  `).all(id) as WordComponentCharacterRow[];

  return {
    ...mapWordRecord(row),
    componentCharacters: componentCharacters.map((character) => ({
      id: character.id,
      hanzi: character.hanzi,
      pinyinDisplay: character.pinyin_display,
      meaningPrimary: character.meaning_primary,
      status: character.status
    }))
  };
}

export { SearchEntityNotFoundError };
