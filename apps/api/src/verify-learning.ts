import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";

const verificationDatabasePath = path.join(
  os.tmpdir(),
  `hanzi-ticket-010-learning-${Date.now()}.sqlite`
);

const HANZI = {
  xue: "\u5b66",
  sheng: "\u751f",
  xuesheng: "\u5b66\u751f",
  xi: "\u4e60",
  lian: "\u7ec3",
  xuexi: "\u5b66\u4e60",
  lianxi: "\u7ec3\u4e60",
  yi: "\u4e59",
  dot: "\u4e36",
  silk: "\u7e9f",
  east: "\u4e1c"
} as const;

interface CurrentLevelResponse {
  level: {
    sequenceNumber: number;
    nextCharacterId: string | null;
    characters: Array<{
      id: string;
      hanzi: string;
      status: string;
      hasApprovedDecomposition: boolean;
      blockedReasons: string[];
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

interface WorkspaceResponse {
  charactersNeedingApproval: Array<{
    character: { id: string; hanzi: string };
    candidates: Array<{
      id: string;
      parts: Array<{ id: string; text: string; resolutionKind: string }>;
    }>;
  }>;
}

async function postJson<T>(baseUrl: string, pathName: string) {
  const response = await fetch(`${baseUrl}${pathName}`, { method: "POST" });
  assert.equal(response.status, 200);
  return await response.json() as T;
}

async function postWithBody<T>(baseUrl: string, pathName: string, body: unknown) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(response.status, 200);
  return await response.json() as T;
}

async function main() {
  process.env.HANZI_DB_PATH = verificationDatabasePath;
  process.env.HANZI_SEED_EXAMPLE_DECOMPOSITIONS = "1";
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
    assert.deepEqual(initial.level.characters.map((character) => character.hanzi), [HANZI.xue, HANZI.sheng]);
    assert.deepEqual(initial.level.words.map((word) => word.simplified), [HANZI.xuesheng]);
    assert(initial.level.characters.every((character) => character.status === "ready"));
    assert(initial.level.characters.every((character) => character.hasApprovedDecomposition));
    assert.deepEqual(initial.level.words[0]?.blockedReasons, ["component_characters_unlearned"]);

    const xue = initial.level.characters.find((character) => character.hanzi === HANZI.xue);
    const sheng = initial.level.characters.find((character) => character.hanzi === HANZI.sheng);
    const student = initial.level.words.find((word) => word.simplified === HANZI.xuesheng);
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
    assert.deepEqual(afterStudent.level.characters.map((character) => character.hanzi), [HANZI.xi, HANZI.lian]);

    const xi = afterStudent.level.characters.find((character) => character.hanzi === HANZI.xi);
    const lian = afterStudent.level.characters.find((character) => character.hanzi === HANZI.lian);
    const study = afterStudent.level.words.find((word) => word.simplified === HANZI.xuexi);
    const practice = afterStudent.level.words.find((word) => word.simplified === HANZI.lianxi);
    assert(xi);
    assert(lian);
    assert(study);
    assert(practice);
    assert.equal(xi.status, "blocked");
    assert.equal(lian.status, "blocked");
    assert.deepEqual(xi.blockedReasons, ["missing_approved_decomposition"]);
    assert.deepEqual(lian.blockedReasons, ["missing_approved_decomposition"]);
    assert.equal(study.status, "blocked");
    assert.equal(practice.status, "blocked");

    const workspaceResponse = await fetch(`${baseUrl}/decompositions/workspace`);
    assert.equal(workspaceResponse.status, 200);
    const workspace = await workspaceResponse.json() as WorkspaceResponse;

    const xiWorkspace = workspace.charactersNeedingApproval.find((entry) => entry.character.id === xi.id);
    const lianWorkspace = workspace.charactersNeedingApproval.find((entry) => entry.character.id === lian.id);
    assert(xiWorkspace);
    assert(lianWorkspace);
    assert.equal(xiWorkspace.candidates.length, 1);
    assert.equal(lianWorkspace.candidates.length, 2);

    for (const part of xiWorkspace.candidates[0]?.parts ?? []) {
      await postWithBody(baseUrl, `/decompositions/parts/${part.id}/resolve`, {
        action: "create_new_prop",
        name: `Verify ${part.text}`,
        shapeRef: part.text,
        meaningOrImage: `Verification prop for ${part.text}`,
        notes: "learning verification"
      });
    }

    await postJson(baseUrl, `/decompositions/candidates/${xiWorkspace.candidates[0]?.id}/approve`);
    const afterXi = await postJson<CurrentLevelResponse>(baseUrl, `/learning/characters/${xi.id}/learned`);
    assert(afterXi.level);
    const studyAfterXi = afterXi.level.words.find((word) => word.simplified === HANZI.xuexi);
    const practiceAfterXi = afterXi.level.words.find((word) => word.simplified === HANZI.lianxi);
    assert.equal(studyAfterXi?.status, "ready");
    assert.equal(practiceAfterXi?.status, "blocked");

    const propsResponse = await fetch(`${baseUrl}/props?search=Verify`);
    assert.equal(propsResponse.status, 200);
    const propsPayload = await propsResponse.json() as {
      items: Array<{ id: string; name: string }>;
    };
    const reusableProp = propsPayload.items.find((item) => item.name === `Verify ${HANZI.yi}`);
    assert(reusableProp);

    const lianPrimaryCandidate = lianWorkspace.candidates[0];
    assert(lianPrimaryCandidate);
    const silkPart = lianPrimaryCandidate.parts.find((part) => part.text === HANZI.silk);
    const eastPart = lianPrimaryCandidate.parts.find((part) => part.text === HANZI.east);
    assert(silkPart);
    assert(eastPart);

    await postWithBody(baseUrl, `/decompositions/parts/${silkPart.id}/resolve`, {
      action: "match_existing_prop",
      propId: reusableProp.id
    });

    await postWithBody(baseUrl, `/decompositions/parts/${eastPart.id}/resolve`, {
      action: "create_known_character_prop",
      name: "Verify East",
      shapeRef: HANZI.east,
      meaningOrImage: "Known character prop for east",
      notes: "learning verification"
    });

    await postJson(baseUrl, `/decompositions/candidates/${lianPrimaryCandidate.id}/approve`);

    const afterLian = await postJson<CurrentLevelResponse>(baseUrl, `/learning/characters/${lian.id}/learned`);
    assert(afterLian.level);
    assert(afterLian.level.words.every((word) => word.status === "ready"));

    const afterStudy = await postJson<CurrentLevelResponse>(baseUrl, `/learning/words/${study.id}/learned`);
    assert(afterStudy.level);
    assert.equal(afterStudy.level.sequenceNumber, 22);

    const finished = await postJson<CurrentLevelResponse>(baseUrl, `/learning/words/${practice.id}/learned`);
    assert.equal(finished.level, null);
    assert.equal(finished.courseComplete, true);

    console.log("Ticket 010 learning verification passed.");
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
