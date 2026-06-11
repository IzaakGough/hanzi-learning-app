import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ImportDiagnostic } from "@hanzi-learning-app/shared";
import { loadNormalizedImportFile } from "./load-import-file.js";
import { exampleImportsDirectory } from "./paths.js";
import { runNormalizedImport } from "../services/imports/import-service.js";

const verificationDatabasePath = path.join(
  os.tmpdir(),
  `hanzi-learning-app-import-verify-${Date.now()}.sqlite`
);

async function createVerificationDatabase() {
  process.env.HANZI_DB_PATH = verificationDatabasePath;

  const { createDatabaseConnection } = await import("../db/connection.js");
  const { runMigrations } = await import("../db/migrate.js");

  const database = createDatabaseConnection();
  runMigrations(database);
  return database;
}

function loadExampleImport(fileName: string) {
  return loadNormalizedImportFile(path.join(exampleImportsDirectory, fileName));
}

async function main() {
  fs.rmSync(verificationDatabasePath, { force: true });

  const database = await createVerificationDatabase();

  try {
    const firstPassResults = [
      runNormalizedImport(database, loadExampleImport("known_characters.json")),
      runNormalizedImport(database, loadExampleImport("known_words.json")),
      runNormalizedImport(database, loadExampleImport("levels.json")),
      runNormalizedImport(database, loadExampleImport("pinyin_mappings.json"))
    ];

    firstPassResults.forEach((result) => {
      assert.equal(result.status, "completed");
    });

    const secondPassResults = [
      runNormalizedImport(database, loadExampleImport("known_characters.json")),
      runNormalizedImport(database, loadExampleImport("known_words.json")),
      runNormalizedImport(database, loadExampleImport("levels.json")),
      runNormalizedImport(database, loadExampleImport("pinyin_mappings.json"))
    ];

    secondPassResults.forEach((result) => {
      assert.equal(result.status, "completed");
    });

    const counts = database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM characters) AS character_count,
        (SELECT COUNT(*) FROM words) AS word_count,
        (SELECT COUNT(*) FROM levels) AS level_count,
        (SELECT COUNT(*) FROM pinyin_mappings) AS mapping_count,
        (SELECT COUNT(*) FROM imports WHERE status = 'completed') AS completed_import_count
    `).get() as {
      character_count: number;
      word_count: number;
      level_count: number;
      mapping_count: number;
      completed_import_count: number;
    };

    assert.equal(counts.character_count, 8);
    assert.equal(counts.word_count, 5);
    assert.equal(counts.level_count, 2);
    assert.equal(counts.mapping_count, 5);
    assert.equal(counts.completed_import_count, 8);

    const learnedCharacter = database.prepare(`
      SELECT
        status,
        source,
        pinyin_source,
        meaning_source,
        pinyin_initial,
        pinyin_final,
        tone
      FROM characters
      WHERE hanzi = '你'
    `).get() as {
      status: string;
      source: string;
      pinyin_source: string;
      meaning_source: string;
      pinyin_initial: string;
      pinyin_final: string;
      tone: string;
    } | undefined;

    const learnedWord = database.prepare(`
      SELECT status, source, pinyin_source, meaning_source
      FROM words
      WHERE simplified = '你好'
    `).get() as {
      status: string;
      source: string;
      pinyin_source: string;
      meaning_source: string;
    } | undefined;

    const enrichedCharacter = database.prepare(`
      SELECT
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
        blocked_reason
      FROM characters
      WHERE hanzi = '学'
    `).get() as {
      pinyin_display: string;
      pinyin_source: string;
      pinyin_source_ref: string;
      pinyin_initial: string;
      pinyin_final: string;
      tone: string;
      meaning_primary: string;
      meaning_source: string;
      meaning_source_ref: string;
      status: string;
      blocked_reason: string | null;
    } | undefined;

    const enrichedWord = database.prepare(`
      SELECT
        pinyin_display,
        pinyin_source,
        pinyin_source_ref,
        meaning_primary,
        meaning_source,
        meaning_source_ref,
        status,
        blocked_reason
      FROM words
      WHERE simplified = '学生'
    `).get() as {
      pinyin_display: string;
      pinyin_source: string;
      pinyin_source_ref: string;
      meaning_primary: string;
      meaning_source: string;
      meaning_source_ref: string;
      status: string;
      blocked_reason: string | null;
    } | undefined;

    assert.deepEqual(learnedCharacter, {
      status: "learned",
      source: "pleco_import",
      pinyin_source: "pleco_import",
      meaning_source: "pleco_import",
      pinyin_initial: "n",
      pinyin_final: "i",
      tone: "3"
    });

    assert.deepEqual(learnedWord, {
      status: "learned",
      source: "pleco_import",
      pinyin_source: "pleco_import",
      meaning_source: "pleco_import"
    });

    assert.deepEqual(enrichedCharacter, {
      pinyin_display: "xue2",
      pinyin_source: "derived",
      pinyin_source_ref: "repo_local_dictionary_v1",
      pinyin_initial: "x",
      pinyin_final: "ue",
      tone: "2",
      meaning_primary: "study",
      meaning_source: "derived",
      meaning_source_ref: "repo_local_dictionary_v1",
      status: "blocked",
      blocked_reason: null
    });

    assert.deepEqual(enrichedWord, {
      pinyin_display: "xue2 sheng1",
      pinyin_source: "derived",
      pinyin_source_ref: "repo_local_dictionary_v1",
      meaning_primary: "student",
      meaning_source: "derived",
      meaning_source_ref: "repo_local_dictionary_v1",
      status: "ready",
      blocked_reason: null
    });

    const levelWordLinks = database.prepare(`
      SELECT l.sequence_number, w.simplified
      FROM level_words lw
      INNER JOIN levels l ON l.id = lw.level_id
      INNER JOIN words w ON w.id = lw.word_id
      ORDER BY l.sequence_number, lw.sort_order
    `).all() as Array<{ sequence_number: number; simplified: string }>;

    assert.deepEqual(levelWordLinks, [
      { sequence_number: 21, simplified: "学生" },
      { sequence_number: 22, simplified: "学习" },
      { sequence_number: 22, simplified: "练习" }
    ]);

    const duplicateWordWarning = runNormalizedImport(database, {
      importType: "levels",
      version: 1,
      sourceName: "duplicate-level-check",
      items: [
        {
          course: "mandarin-blueprint",
          sequenceNumber: 23,
          title: "Level 23",
          characters: [],
          words: [{ simplified: "学生" }]
        }
      ]
    });

    assert.equal(duplicateWordWarning.status, "completed");
    assert.ok(
      duplicateWordWarning.diagnostics.some(
        (diagnostic: ImportDiagnostic) => diagnostic.code === "duplicate_level_word_introduction"
      )
    );

    const missingLexicalWarning = runNormalizedImport(database, {
      importType: "levels",
      version: 1,
      sourceName: "missing-lexical-check",
      items: [
        {
          course: "mandarin-blueprint",
          sequenceNumber: 24,
          title: "Level 24",
          characters: [{ hanzi: "未" }],
          words: [{ simplified: "未知" }]
        }
      ]
    });

    assert.equal(missingLexicalWarning.status, "completed");
    assert.ok(
      missingLexicalWarning.diagnostics.some(
        (diagnostic: ImportDiagnostic) =>
          diagnostic.code === "character_missing_lexical_data" &&
          diagnostic.entityKey === "未"
      )
    );
    assert.ok(
      missingLexicalWarning.diagnostics.some(
        (diagnostic: ImportDiagnostic) =>
          diagnostic.code === "word_missing_lexical_data" &&
          diagnostic.entityKey === "未知"
      )
    );

    const unresolvedRows = database.prepare(`
      SELECT
        (SELECT blocked_reason FROM characters WHERE hanzi = '未') AS character_blocked_reason,
        (SELECT blocked_reason FROM words WHERE simplified = '未知') AS word_blocked_reason
    `).get() as {
      character_blocked_reason: string | null;
      word_blocked_reason: string | null;
    };

    assert.deepEqual(unresolvedRows, {
      character_blocked_reason: "missing_lexical_data",
      word_blocked_reason: "missing_lexical_data"
    });

    const zeroInitialImport = runNormalizedImport(database, {
      importType: "levels",
      version: 1,
      sourceName: "zero-initial-check",
      items: [
        {
          course: "mandarin-blueprint",
          sequenceNumber: 25,
          title: "Level 25",
          characters: [{ hanzi: "爱" }],
          words: []
        }
      ]
    });

    assert.equal(zeroInitialImport.status, "completed");

    const zeroInitialCharacter = database.prepare(`
      SELECT pinyin_initial, pinyin_final, tone
      FROM characters
      WHERE hanzi = '爱'
    `).get() as {
      pinyin_initial: string;
      pinyin_final: string;
      tone: string;
    } | undefined;

    assert.deepEqual(zeroInitialCharacter, {
      pinyin_initial: "null",
      pinyin_final: "ai",
      tone: "4"
    });

    console.log(`Import verification passed using ${pathToFileURL(verificationDatabasePath).href}`);
  } finally {
    database.close();
    fs.rmSync(verificationDatabasePath, { force: true });
  }
}

void main();
