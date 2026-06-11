import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const npmExecutable = "npm";
const verificationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hanzi-ticket-020-"));
const verificationDatabasePath = path.join(verificationRoot, "verification.sqlite");
const verificationExportsDirectory = path.join(verificationRoot, "exports");
const verificationBackupPath = path.join(verificationExportsDirectory, "backups", "verification.sqlite");

function runCommand(commandArguments: string[]) {
  const result = spawnSync(npmExecutable, commandArguments, {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      HANZI_DB_PATH: verificationDatabasePath,
      HANZI_EXPORTS_DIR: verificationExportsDirectory
    }
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: npm ${commandArguments.join(" ")}\n${result.stdout}\n${result.stderr}`);
  }
}

function readJsonFile<T>(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

async function seedVerificationData() {
  process.env.HANZI_DB_PATH = verificationDatabasePath;

  const { createDatabaseConnection } = await import("./db/connection.js");
  const { runMigrations } = await import("./db/migrate.js");
  const { exampleImportsDirectory } = await import("./imports/paths.js");
  const { loadNormalizedImportFile } = await import("./imports/load-import-file.js");
  const { runNormalizedImport } = await import("./services/imports/import-service.js");
  const { createProp } = await import("./services/admin/props-service.js");
  const {
    createDecompositionCandidate,
    approveDecompositionCandidate,
    resolveDecompositionPart
  } = await import("./services/decomposition/decomposition-service.js");

  const database = createDatabaseConnection();

  try {
    runMigrations(database);

    for (const fileName of [
      "known_characters.json",
      "known_words.json",
      "levels.json",
      "pinyin_mappings.json"
    ]) {
      runNormalizedImport(database, loadNormalizedImportFile(path.join(exampleImportsDirectory, fileName)));
    }

    createProp(database, {
      name: "Ticket 020 Prop",
      type: "component",
      shapeRef: "020-shape",
      meaningOrImage: "Verification prop",
      notes: "Created by backup verification",
      isActive: true
    });

    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO characters (
        id,
        hanzi,
        pinyin_display,
        meaning_primary,
        status,
        blocked_reason,
        source,
        source_ref,
        created_at,
        updated_at
      )
      VALUES (
        'ticket-020-character',
        '森',
        'sen1',
        'forest',
        'blocked',
        'missing_approved_decomposition',
        'manual',
        'extra/custom',
        @now,
        @now
      )
    `).run({ now });

    const workspace = createDecompositionCandidate(database, "ticket-020-character", {
      parts: ["tree", "tree", "tree"],
      notes: "Verification approved decomposition"
    });

    const candidate = workspace.candidates[0];
    assert(candidate);

    for (const [index, part] of candidate.parts.entries()) {
      resolveDecompositionPart(database, part.id, {
        action: "create_new_prop",
        name: `Ticket 020 Part ${index + 1}`,
        shapeRef: part.text,
        meaningOrImage: `Verification part ${index + 1}`,
        notes: "Created by backup verification"
      });
    }

    approveDecompositionCandidate(database, candidate.id);
  } finally {
    database.close();
  }
}

async function main() {
  fs.rmSync(verificationRoot, { recursive: true, force: true });
  fs.mkdirSync(verificationRoot, { recursive: true });

  await seedVerificationData();

  runCommand(["run", "db:backup", "--", "--output", verificationBackupPath]);
  runCommand(["run", "exports:run"]);

  assert(fs.existsSync(verificationBackupPath));
  assert(fs.statSync(verificationBackupPath).size > 0);

  const knownCharacters = readJsonFile<{
    importType: string;
    items: Array<{ hanzi: string }>;
  }>(path.join(verificationExportsDirectory, "datasets", "known_characters.json"));
  assert.equal(knownCharacters.importType, "known_characters");
  assert(knownCharacters.items.some((item) => item.hanzi === "你"));

  const knownWords = readJsonFile<{
    importType: string;
    items: Array<{ simplified: string }>;
  }>(path.join(verificationExportsDirectory, "datasets", "known_words.json"));
  assert.equal(knownWords.importType, "known_words");
  assert(knownWords.items.some((item) => item.simplified === "你好"));

  const props = readJsonFile<{
    exportType: string;
    items: Array<{ name: string }>;
  }>(path.join(verificationExportsDirectory, "datasets", "props.json"));
  assert.equal(props.exportType, "props");
  assert(props.items.some((item) => item.name === "Ticket 020 Prop"));

  const approvedDecompositions = readJsonFile<{
    exportType: string;
    items: Array<{ hanzi: string }>;
  }>(path.join(verificationExportsDirectory, "datasets", "approved_decompositions.json"));
  assert.equal(approvedDecompositions.exportType, "approved_decompositions");
  assert(approvedDecompositions.items.some((item) => item.hanzi === "森"));

  runCommand(["run", "db:reset", "--", "--yes"]);

  process.env.HANZI_DB_PATH = verificationDatabasePath;
  const { createDatabaseConnection } = await import("./db/connection.js");
  const database = createDatabaseConnection();

  try {
    const characterCount = database.prepare("SELECT COUNT(*) AS count FROM characters").get() as { count: number };
    const wordCount = database.prepare("SELECT COUNT(*) AS count FROM words").get() as { count: number };
    assert.equal(characterCount.count, 0);
    assert.equal(wordCount.count, 0);
  } finally {
    database.close();
  }

  console.log("Ticket 020 backup/export/reset verification passed.");
  fs.rmSync(verificationRoot, { recursive: true, force: true });
}

void main();
