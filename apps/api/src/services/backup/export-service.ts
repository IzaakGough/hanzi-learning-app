import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { type PropType, type ItemSource } from "@hanzi-learning-app/shared";

export type ExportDatasetName =
  | "known_characters"
  | "known_words"
  | "props"
  | "approved_decompositions";

interface KnownCharacterExportRow {
  hanzi: string;
  pinyin_display: string | null;
  meaning_primary: string | null;
  source: ItemSource;
  source_ref: string | null;
  notes: string | null;
}

interface KnownWordExportRow {
  simplified: string;
  pinyin_display: string | null;
  meaning_primary: string | null;
  source: ItemSource;
  source_ref: string | null;
  notes: string | null;
}

interface PropExportRow {
  name: string;
  type: PropType;
  shape_ref: string | null;
  meaning_or_image: string;
  notes: string | null;
  is_active: number;
}

interface ApprovedDecompositionPartRow {
  decomposition_id: string;
  hanzi: string;
  source: ItemSource;
  source_ref: string | null;
  notes: string | null;
  prop_id: string | null;
  prop_name: string | null;
  prop_type: PropType | null;
  prop_shape_ref: string | null;
  prop_meaning_or_image: string | null;
  prop_is_active: number | null;
  character_id: string | null;
  part_character_hanzi: string | null;
  literal_text: string | null;
}

interface PropsExportFile {
  exportType: "props";
  version: 1;
  sourceName: string;
  items: Array<{
    name: string;
    type: PropType;
    shapeRef?: string;
    meaningOrImage: string;
    notes?: string;
    isActive: boolean;
  }>;
}

interface ApprovedDecompositionsExportFile {
  exportType: "approved_decompositions";
  version: 1;
  sourceName: string;
  items: Array<{
    hanzi: string;
    source: ItemSource;
    sourceRef?: string;
    notes?: string;
    parts: Array<
      | {
          resolutionKind: "literal";
          text: string;
        }
      | {
          resolutionKind: "character";
          text: string;
          characterHanzi: string;
        }
      | {
          resolutionKind: "prop";
          text: string;
          prop: {
            name: string;
            type: PropType;
            shapeRef?: string;
            meaningOrImage: string;
            isActive: boolean;
          };
        }
    >;
  }>;
}

function writeJson(outputPath: string, payload: unknown) {
  const resolvedOutputPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return resolvedOutputPath;
}

function exportKnownCharacters(database: Database.Database, sourceName: string) {
  const rows = database.prepare(`
    SELECT
      hanzi,
      pinyin_display,
      meaning_primary,
      source,
      source_ref,
      notes
    FROM characters
    WHERE status = 'learned' AND archived_at IS NULL
    ORDER BY hanzi COLLATE NOCASE ASC
  `).all() as KnownCharacterExportRow[];

  return {
    importType: "known_characters" as const,
    version: 1 as const,
    sourceName,
    items: rows.map((row) => ({
      hanzi: row.hanzi,
      ...(row.pinyin_display ? { pinyinDisplay: row.pinyin_display } : {}),
      ...(row.meaning_primary ? { meaningPrimary: row.meaning_primary } : {}),
      source: row.source,
      ...(row.source_ref ? { sourceRef: row.source_ref } : {}),
      ...(row.notes ? { notes: row.notes } : {})
    }))
  };
}

function exportKnownWords(database: Database.Database, sourceName: string) {
  const rows = database.prepare(`
    SELECT
      simplified,
      pinyin_display,
      meaning_primary,
      source,
      source_ref,
      notes
    FROM words
    WHERE status = 'learned' AND archived_at IS NULL
    ORDER BY simplified COLLATE NOCASE ASC
  `).all() as KnownWordExportRow[];

  return {
    importType: "known_words" as const,
    version: 1 as const,
    sourceName,
    items: rows.map((row) => ({
      simplified: row.simplified,
      ...(row.pinyin_display ? { pinyinDisplay: row.pinyin_display } : {}),
      ...(row.meaning_primary ? { meaningPrimary: row.meaning_primary } : {}),
      source: row.source,
      ...(row.source_ref ? { sourceRef: row.source_ref } : {}),
      ...(row.notes ? { notes: row.notes } : {})
    }))
  };
}

function exportProps(database: Database.Database, sourceName: string): PropsExportFile {
  const rows = database.prepare(`
    SELECT
      name,
      type,
      shape_ref,
      meaning_or_image,
      notes,
      is_active
    FROM props
    ORDER BY name COLLATE NOCASE ASC
  `).all() as PropExportRow[];

  return {
    exportType: "props",
    version: 1,
    sourceName,
    items: rows.map((row) => ({
      name: row.name,
      type: row.type,
      ...(row.shape_ref ? { shapeRef: row.shape_ref } : {}),
      meaningOrImage: row.meaning_or_image,
      ...(row.notes ? { notes: row.notes } : {}),
      isActive: row.is_active === 1
    }))
  };
}

function exportApprovedDecompositions(
  database: Database.Database,
  sourceName: string
): ApprovedDecompositionsExportFile {
  const rows = database.prepare(`
    SELECT
      cd.id AS decomposition_id,
      c.hanzi AS hanzi,
      cd.source AS source,
      cd.source_ref AS source_ref,
      cd.notes AS notes,
      cdp.prop_id AS prop_id,
      p.name AS prop_name,
      p.type AS prop_type,
      p.shape_ref AS prop_shape_ref,
      p.meaning_or_image AS prop_meaning_or_image,
      p.is_active AS prop_is_active,
      cdp.character_id AS character_id,
      part_character.hanzi AS part_character_hanzi,
      cdp.literal_text AS literal_text
    FROM character_decompositions cd
    INNER JOIN characters c ON c.id = cd.character_id
    INNER JOIN character_decomposition_parts cdp ON cdp.decomposition_id = cd.id
    LEFT JOIN props p ON p.id = cdp.prop_id
    LEFT JOIN characters part_character ON part_character.id = cdp.character_id
    WHERE cd.status = 'approved'
    ORDER BY c.hanzi COLLATE NOCASE ASC, cd.created_at ASC, cdp.sort_order ASC
  `).all() as ApprovedDecompositionPartRow[];

  const itemsByDecompositionId = new Map<string, ApprovedDecompositionsExportFile["items"][number]>();

  for (const row of rows) {
    let item = itemsByDecompositionId.get(row.decomposition_id);

    if (!item) {
      item = {
        hanzi: row.hanzi,
        source: row.source,
        ...(row.source_ref ? { sourceRef: row.source_ref } : {}),
        ...(row.notes ? { notes: row.notes } : {}),
        parts: []
      };
      itemsByDecompositionId.set(row.decomposition_id, item);
    }

    if (row.literal_text) {
      item.parts.push({
        resolutionKind: "literal",
        text: row.literal_text
      });
      continue;
    }

    if (row.character_id && row.part_character_hanzi) {
      item.parts.push({
        resolutionKind: "character",
        text: row.part_character_hanzi,
        characterHanzi: row.part_character_hanzi
      });
      continue;
    }

    if (
      row.prop_id &&
      row.prop_name &&
      row.prop_type &&
      row.prop_meaning_or_image !== null &&
      row.prop_is_active !== null
    ) {
      item.parts.push({
        resolutionKind: "prop",
        text: row.prop_shape_ref ?? row.prop_name,
        prop: {
          name: row.prop_name,
          type: row.prop_type,
          ...(row.prop_shape_ref ? { shapeRef: row.prop_shape_ref } : {}),
          meaningOrImage: row.prop_meaning_or_image,
          isActive: row.prop_is_active === 1
        }
      });
    }
  }

  return {
    exportType: "approved_decompositions",
    version: 1,
    sourceName,
    items: [...itemsByDecompositionId.values()]
  };
}

export function exportDataset(
  database: Database.Database,
  dataset: ExportDatasetName,
  params: {
    outputPath: string;
    sourceName: string;
  }
) {
  switch (dataset) {
    case "known_characters":
      return writeJson(params.outputPath, exportKnownCharacters(database, params.sourceName));
    case "known_words":
      return writeJson(params.outputPath, exportKnownWords(database, params.sourceName));
    case "props":
      return writeJson(params.outputPath, exportProps(database, params.sourceName));
    case "approved_decompositions":
      return writeJson(params.outputPath, exportApprovedDecompositions(database, params.sourceName));
  }
}
