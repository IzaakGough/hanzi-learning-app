import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import {
  ItemSource,
  parseStructuralDecompositionImport,
  type StructuralDecompositionImportPayload
} from "@hanzi-learning-app/shared";
import { repoRoot } from "../../imports/paths.js";
import { syncLearningStatuses } from "../learning/level-progression-service.js";

const structuralDatasetPath = path.join(
  repoRoot,
  "data",
  "imports",
  "structural",
  "chise_ids.json"
);

let cachedDataset: StructuralDecompositionImportPayload | null = null;

function loadDataset() {
  if (cachedDataset) {
    return cachedDataset;
  }

  const raw = fs.readFileSync(structuralDatasetPath, "utf8");
  cachedDataset = parseStructuralDecompositionImport(JSON.parse(raw));
  return cachedDataset;
}

function makeStableId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function buildCandidateSignature(
  database: Database.Database,
  decompositionId: string
) {
  const rows = database.prepare(`
    SELECT
      cdp.literal_text,
      c.hanzi AS character_hanzi,
      p.shape_ref,
      p.name AS prop_name
    FROM character_decomposition_parts cdp
    LEFT JOIN characters c ON c.id = cdp.character_id
    LEFT JOIN props p ON p.id = cdp.prop_id
    WHERE cdp.decomposition_id = ?
    ORDER BY cdp.sort_order ASC
  `).all(decompositionId) as Array<{
    literal_text: string | null;
    character_hanzi: string | null;
    shape_ref: string | null;
    prop_name: string | null;
  }>;

  return rows
    .map((row) => row.shape_ref ?? row.prop_name ?? row.character_hanzi ?? row.literal_text ?? "")
    .join("|");
}

function hasExactCandidate(
  database: Database.Database,
  characterId: string,
  expectedParts: string[]
) {
  const expectedSignature = expectedParts.join("|");
  const candidateRows = database.prepare(`
    SELECT id
    FROM character_decompositions
    WHERE character_id = ?
      AND status = 'candidate'
    ORDER BY created_at ASC
  `).all(characterId) as Array<{ id: string }>;

  return candidateRows.some((row) => buildCandidateSignature(database, row.id) === expectedSignature);
}

function findCharacterId(database: Database.Database, hanzi: string) {
  const row = database.prepare(`
    SELECT id
    FROM characters
    WHERE hanzi = ?
  `).get(hanzi) as { id: string } | undefined;

  return row?.id ?? null;
}

function hasApprovedDecomposition(database: Database.Database, characterId: string) {
  const row = database.prepare(`
    SELECT id
    FROM character_decompositions
    WHERE character_id = ?
      AND status = 'approved'
    LIMIT 1
  `).get(characterId) as { id: string } | undefined;

  return Boolean(row);
}

function findMatchingPropId(database: Database.Database, shapeRef: string) {
  const row = database.prepare(`
    SELECT id
    FROM props
    WHERE is_active = 1
      AND shape_ref = ?
    ORDER BY name COLLATE NOCASE ASC, created_at ASC, id ASC
    LIMIT 1
  `).get(shapeRef) as { id: string } | undefined;

  return row?.id ?? null;
}

export function seedStructuralDecompositionCandidates(database: Database.Database) {
  const dataset = loadDataset();
  const now = new Date().toISOString();
  let createdCount = 0;

  const insertDecomposition = database.prepare(`
    INSERT INTO character_decompositions (
      id,
      character_id,
      status,
      source,
      source_ref,
      notes,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @characterId,
      'candidate',
      @source,
      @sourceRef,
      @notes,
      @createdAt,
      @updatedAt
    )
  `);

  const insertPart = database.prepare(`
    INSERT INTO character_decomposition_parts (
      id,
      decomposition_id,
      prop_id,
      literal_text,
      sort_order,
      created_at
    )
    VALUES (
      @id,
      @decompositionId,
      @propId,
      @literalText,
      @sortOrder,
      @createdAt
    )
  `);

  const run = database.transaction(() => {
    for (const characterEntry of dataset.characters) {
      const characterId = findCharacterId(database, characterEntry.hanzi);

      if (!characterId || hasApprovedDecomposition(database, characterId)) {
        continue;
      }

      for (const structure of characterEntry.structures.slice(0, 3)) {
        if (hasExactCandidate(database, characterId, structure.parts)) {
          continue;
        }

        const decompositionId = makeStableId(
          "struct_decomp",
          `${dataset.sourceName}:${characterEntry.hanzi}:${structure.ids}:${structure.parts.join("|")}`
        );
        const sourceRef = structure.sourceRef ?? structure.ids;
        const notes = structure.notes ?? `Imported from ${dataset.sourceName}`;

        insertDecomposition.run({
          id: decompositionId,
          characterId,
          source: ItemSource.Derived,
          sourceRef,
          notes,
          createdAt: now,
          updatedAt: now
        });

        structure.parts.forEach((part, index) => {
          const propId = findMatchingPropId(database, part);

          insertPart.run({
            id: makeStableId("struct_part", `${decompositionId}:${index}:${part}`),
            decompositionId,
            propId,
            literalText: propId ? null : part,
            sortOrder: index,
            createdAt: now
          });
        });

        createdCount += 1;
      }
    }
  });

  run();
  syncLearningStatuses(database);
  return createdCount;
}
