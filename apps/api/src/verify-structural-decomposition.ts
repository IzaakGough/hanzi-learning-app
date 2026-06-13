import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const verificationDatabasePath = path.join(
  os.tmpdir(),
  `hanzi-structural-decomposition-${Date.now()}.sqlite`
);

async function main() {
  process.env.HANZI_DB_PATH = verificationDatabasePath;
  delete process.env.HANZI_SEED_EXAMPLE_DECOMPOSITIONS;
  fs.rmSync(verificationDatabasePath, { force: true });

  const { createDatabaseConnection } = await import("./db/connection.js");
  const { runMigrations } = await import("./db/migrate.js");
  const { exampleImportsDirectory } = await import("./imports/paths.js");
  const { loadNormalizedImportFile } = await import("./imports/load-import-file.js");
  const { runNormalizedImport } = await import("./services/imports/import-service.js");
  const { listDecompositionWorkspace } = await import("./services/decomposition/decomposition-service.js");

  const database = createDatabaseConnection();
  runMigrations(database);

  try {
    const now = new Date().toISOString();
    const silkPropId = randomUUID();

    database.prepare(`
      INSERT INTO props (
        id,
        name,
        type,
        shape_ref,
        meaning_or_image,
        notes,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        'Verification Silk',
        'component',
        '纟',
        'Verification prop for structural matching',
        NULL,
        1,
        @createdAt,
        @updatedAt
      )
    `).run({
      id: silkPropId,
      createdAt: now,
      updatedAt: now
    });

    for (const fileName of [
      "known_characters.json",
      "known_words.json",
      "levels.json",
      "pinyin_mappings.json"
    ]) {
      const payload = loadNormalizedImportFile(path.join(exampleImportsDirectory, fileName));
      const summary = runNormalizedImport(database, payload);
      assert.equal(summary.status, "completed");
    }

    const seededCandidates = database.prepare(`
      SELECT
        cd.id,
        cd.source_ref,
        GROUP_CONCAT(COALESCE(cdp.literal_text, p.shape_ref), '|') AS parts_signature
      FROM character_decompositions cd
      INNER JOIN characters c ON c.id = cd.character_id
      INNER JOIN character_decomposition_parts cdp ON cdp.decomposition_id = cd.id
      LEFT JOIN props p ON p.id = cdp.prop_id
      WHERE c.hanzi = '练'
        AND cd.status = 'candidate'
      GROUP BY cd.id, cd.source_ref
      ORDER BY cd.created_at ASC
    `).all() as Array<{
      id: string;
      source_ref: string | null;
      parts_signature: string;
    }>;

    const mappedCandidate = seededCandidates.find((candidate) =>
      candidate.source_ref?.startsWith("U+")
      && candidate.parts_signature === "纟|𫠣"
    );

    assert(mappedCandidate, "Expected 练 to receive a structural candidate from the CHISE UCS dataset.");

    const mappedParts = database.prepare(`
      SELECT
        cd.source_ref,
        cdp.sort_order,
        cdp.prop_id,
        cdp.literal_text
      FROM character_decompositions cd
      INNER JOIN character_decomposition_parts cdp ON cdp.decomposition_id = cd.id
      WHERE cd.id = ?
      ORDER BY cdp.sort_order ASC
    `).all(mappedCandidate.id) as Array<{
      source_ref: string | null;
      sort_order: number;
      prop_id: string | null;
      literal_text: string | null;
    }>;

    assert.deepEqual(mappedParts, [
      {
        source_ref: "U+7EC3",
        sort_order: 0,
        prop_id: silkPropId,
        literal_text: null
      },
      {
        source_ref: "U+7EC3",
        sort_order: 1,
        prop_id: null,
        literal_text: "𫠣"
      }
    ]);

    const workspace = listDecompositionWorkspace(database);
    const unresolvedForLian = workspace.unresolvedProps.filter((item) => item.characterHanzi === "练");

    assert.equal(unresolvedForLian.length, 1);
    assert.equal(unresolvedForLian[0]?.literalText, "𫠣");

    console.log("Structural decomposition verification passed.");
  } finally {
    database.close();
    fs.rmSync(verificationDatabasePath, { force: true });
  }
}

void main();
