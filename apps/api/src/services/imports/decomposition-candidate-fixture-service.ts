import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { ItemSource } from "@hanzi-learning-app/shared";
import { repoRoot } from "../../imports/paths.js";

interface CandidateFixtureCharacter {
  hanzi: string;
  candidates: Array<{
    notes?: string;
    parts: string[];
  }>;
}

interface CandidateFixtureFile {
  sourceName: string;
  characters: CandidateFixtureCharacter[];
}

const candidateFixturePath = path.join(
  repoRoot,
  "data",
  "imports",
  "examples",
  "decomposition_candidates.json"
);

let cachedFixture: CandidateFixtureFile | null = null;

function loadFixture() {
  if (cachedFixture) {
    return cachedFixture;
  }

  const raw = fs.readFileSync(candidateFixturePath, "utf8");
  cachedFixture = JSON.parse(raw) as CandidateFixtureFile;
  return cachedFixture;
}

export function seedExampleDecompositionCandidates(database: Database.Database) {
  const fixture = loadFixture();
  const now = new Date().toISOString();
  const findCharacter = database.prepare("SELECT id FROM characters WHERE hanzi = ?");
  const hasApproved = database.prepare(`
    SELECT id
    FROM character_decompositions
    WHERE character_id = ? AND status = 'approved'
    LIMIT 1
  `);
  const hasExactCandidate = database.prepare(`
    SELECT cd.id
    FROM character_decompositions cd
    INNER JOIN character_decomposition_parts cdp ON cdp.decomposition_id = cd.id
    WHERE cd.character_id = ?
      AND cd.status = 'candidate'
    GROUP BY cd.id
    HAVING GROUP_CONCAT(COALESCE(cdp.literal_text, ''), '|') = ?
    LIMIT 1
  `);
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
      literal_text,
      sort_order,
      created_at
    )
    VALUES (
      @id,
      @decompositionId,
      @literalText,
      @sortOrder,
      @createdAt
    )
  `);

  for (const characterEntry of fixture.characters) {
    const character = findCharacter.get(characterEntry.hanzi) as { id: string } | undefined;

    if (!character) {
      continue;
    }

    if (hasApproved.get(character.id)) {
      continue;
    }

    for (const candidateEntry of characterEntry.candidates) {
      const signature = candidateEntry.parts.join("|");

      if (hasExactCandidate.get(character.id, signature)) {
        continue;
      }

      const decompositionId = randomUUID();

      insertDecomposition.run({
        id: decompositionId,
        characterId: character.id,
        source: ItemSource.Derived,
        sourceRef: fixture.sourceName,
        notes: candidateEntry.notes ?? "Repo example decomposition candidate fixture",
        createdAt: now,
        updatedAt: now
      });

      candidateEntry.parts.forEach((part, index) => {
        insertPart.run({
          id: randomUUID(),
          decompositionId,
          literalText: part,
          sortOrder: index,
          createdAt: now
        });
      });
    }
  }
}
