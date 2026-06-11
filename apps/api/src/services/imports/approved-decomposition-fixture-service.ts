import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { ItemSource } from "@hanzi-learning-app/shared";
import { repoRoot } from "../../imports/paths.js";

interface ApprovedDecompositionFixtureCharacter {
  hanzi: string;
  parts: string[];
}

interface ApprovedDecompositionFixtureFile {
  sourceName: string;
  characters: ApprovedDecompositionFixtureCharacter[];
}

interface CharacterRow {
  id: string;
}

const approvedDecompositionFixturePath = path.join(
  repoRoot,
  "data",
  "imports",
  "examples",
  "approved_decompositions.json"
);

let cachedFixture: ApprovedDecompositionFixtureFile | null = null;

function loadFixture() {
  if (cachedFixture) {
    return cachedFixture;
  }

  const raw = fs.readFileSync(approvedDecompositionFixturePath, "utf8");
  cachedFixture = JSON.parse(raw) as ApprovedDecompositionFixtureFile;
  return cachedFixture;
}

export function seedExampleApprovedDecompositions(database: Database.Database) {
  const fixture = loadFixture();
  const now = new Date().toISOString();
  const findCharacter = database.prepare("SELECT id FROM characters WHERE hanzi = ?");
  const findApproved = database.prepare(`
    SELECT id
    FROM character_decompositions
    WHERE character_id = ? AND status = 'approved'
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
      'approved',
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

  for (const entry of fixture.characters) {
    const character = findCharacter.get(entry.hanzi) as CharacterRow | undefined;

    if (!character) {
      continue;
    }

    const existingApproved = findApproved.get(character.id) as { id: string } | undefined;

    if (existingApproved) {
      continue;
    }

    const decompositionId = randomUUID();

    insertDecomposition.run({
      id: decompositionId,
      characterId: character.id,
      source: ItemSource.Manual,
      sourceRef: fixture.sourceName,
      notes: "Repo example approved decomposition fixture",
      createdAt: now,
      updatedAt: now
    });

    entry.parts.forEach((part, index) => {
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
