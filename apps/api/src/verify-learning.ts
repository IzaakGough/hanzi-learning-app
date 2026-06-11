import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";

const verificationDatabasePath = path.join(
  os.tmpdir(),
  `hanzi-ticket-008-${Date.now()}.sqlite`
);

interface CurrentLevelResponse {
  level: {
    sequenceNumber: number;
    nextCharacterId: string | null;
    characters: Array<{
      id: string;
      hanzi: string;
      status: string;
      hasApprovedDecomposition: boolean;
    }>;
    words: Array<{
      id: string;
      simplified: string;
      status: string;
      blockedReasons: string[];
    }>;
  } | null;
  courseComplete: boolean;
}

async function postJson<T>(baseUrl: string, pathName: string) {
  const response = await fetch(`${baseUrl}${pathName}`, { method: "POST" });
  assert.equal(response.status, 200);
  return await response.json() as T;
}

async function main() {
  process.env.HANZI_DB_PATH = verificationDatabasePath;
  fs.rmSync(verificationDatabasePath, { force: true });

  const { createDatabaseConnection } = await import("./db/connection.js");
  const { runMigrations } = await import("./db/migrate.js");
  const { createApp } = await import("./app.js");
  const { exampleImportsDirectory } = await import("./imports/paths.js");
  const { loadNormalizedImportFile } = await import("./imports/load-import-file.js");
  const { runNormalizedImport } = await import("./services/imports/import-service.js");

  const database = createDatabaseConnection();
  runMigrations(database);

  for (const fileName of [
    "known_characters.json",
    "known_words.json",
    "levels.json",
    "pinyin_mappings.json"
  ]) {
    runNormalizedImport(database, loadNormalizedImportFile(path.join(exampleImportsDirectory, fileName)));
  }

  const app = createApp(database);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const initialResponse = await fetch(`${baseUrl}/levels/current`);
    assert.equal(initialResponse.status, 200);
    const initial = await initialResponse.json() as CurrentLevelResponse;

    assert(initial.level);
    assert.equal(initial.level.sequenceNumber, 21);
    assert.deepEqual(initial.level.characters.map((character) => character.hanzi), ["学", "生"]);
    assert.deepEqual(initial.level.words.map((word) => word.simplified), ["学生"]);
    assert(initial.level.characters.every((character) => character.status === "ready"));
    assert(initial.level.characters.every((character) => character.hasApprovedDecomposition));
    assert.deepEqual(initial.level.words[0]?.blockedReasons, ["component_characters_unlearned"]);

    const xue = initial.level.characters.find((character) => character.hanzi === "学");
    const sheng = initial.level.characters.find((character) => character.hanzi === "生");
    const student = initial.level.words.find((word) => word.simplified === "学生");
    assert(xue);
    assert(sheng);
    assert(student);
    assert.equal(initial.level.nextCharacterId, xue.id);

    const afterXue = await postJson<CurrentLevelResponse>(baseUrl, `/learning/characters/${xue.id}/learned`);
    assert(afterXue.level);
    assert.equal(afterXue.level.sequenceNumber, 21);
    assert.equal(afterXue.level.words[0]?.status, "blocked");

    const afterSheng = await postJson<CurrentLevelResponse>(baseUrl, `/learning/characters/${sheng.id}/learned`);
    assert(afterSheng.level);
    assert.equal(afterSheng.level.sequenceNumber, 21);
    assert.equal(afterSheng.level.words[0]?.status, "ready");

    const afterStudent = await postJson<CurrentLevelResponse>(baseUrl, `/learning/words/${student.id}/learned`);
    assert(afterStudent.level);
    assert.equal(afterStudent.level.sequenceNumber, 22);
    assert.deepEqual(afterStudent.level.characters.map((character) => character.hanzi), ["习", "练"]);

    const xi = afterStudent.level.characters.find((character) => character.hanzi === "习");
    const lian = afterStudent.level.characters.find((character) => character.hanzi === "练");
    const study = afterStudent.level.words.find((word) => word.simplified === "学习");
    const practice = afterStudent.level.words.find((word) => word.simplified === "练习");
    assert(xi);
    assert(lian);
    assert(study);
    assert(practice);
    assert.equal(study.status, "blocked");
    assert.equal(practice.status, "blocked");

    const afterXi = await postJson<CurrentLevelResponse>(baseUrl, `/learning/characters/${xi.id}/learned`);
    assert(afterXi.level);
    const studyAfterXi = afterXi.level.words.find((word) => word.simplified === "学习");
    const practiceAfterXi = afterXi.level.words.find((word) => word.simplified === "练习");
    assert.equal(studyAfterXi?.status, "ready");
    assert.equal(practiceAfterXi?.status, "blocked");

    const afterLian = await postJson<CurrentLevelResponse>(baseUrl, `/learning/characters/${lian.id}/learned`);
    assert(afterLian.level);
    assert(afterLian.level.words.every((word) => word.status === "ready"));

    const afterStudy = await postJson<CurrentLevelResponse>(baseUrl, `/learning/words/${study.id}/learned`);
    assert(afterStudy.level);
    assert.equal(afterStudy.level.sequenceNumber, 22);

    const finished = await postJson<CurrentLevelResponse>(baseUrl, `/learning/words/${practice.id}/learned`);
    assert.equal(finished.level, null);
    assert.equal(finished.courseComplete, true);

    console.log("Ticket 008 learning verification passed.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    database.close();
    fs.rmSync(verificationDatabasePath, { force: true });
  }
}

void main();
