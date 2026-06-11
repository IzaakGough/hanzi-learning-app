import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";

const verificationDatabasePath = path.join(
  os.tmpdir(),
  `hanzi-ticket-010-decomposition-${Date.now()}.sqlite`
);

const HANZI = {
  xi: "\u4e60",
  lian: "\u7ec3",
  yi: "\u4e59",
  dot: "\u4e36",
  silk: "\u7e9f",
  east: "\u4e1c",
  lianxi: "\u7ec3\u4e60"
} as const;

interface WorkspaceResponse {
  charactersNeedingApproval: Array<{
    character: {
      id: string;
      hanzi: string;
      status: string;
      blockedReason: string | null;
    };
    approvedDecomposition: unknown;
    candidates: Array<{
      id: string;
      status: string;
      parts: Array<{
        id: string;
        text: string;
        resolutionKind: string;
      }>;
    }>;
    linkedWords: Array<{
      simplified: string;
      status: string;
    }>;
  }>;
  unresolvedProps: Array<{
    partId: string;
    candidateId: string;
    characterId: string;
    characterHanzi: string;
    literalText: string;
    existingPropOptions: Array<{ id: string; name: string }>;
    blockedDependencies: Array<{
      text: string;
      kind: "character" | "word";
      status: string;
    }>;
  }>;
}

async function postWithBody<T>(baseUrl: string, pathName: string, body: unknown, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(response.status, expectedStatus);
  return await response.json() as T;
}

async function postWithoutBody<T>(baseUrl: string, pathName: string, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${pathName}`, { method: "POST" });
  assert.equal(response.status, expectedStatus);
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

    const initialWorkspaceResponse = await fetch(`${baseUrl}/decompositions/workspace`);
    assert.equal(initialWorkspaceResponse.status, 200);
    const initialWorkspace = await initialWorkspaceResponse.json() as WorkspaceResponse;

    const xiWorkspace = initialWorkspace.charactersNeedingApproval.find((entry) => entry.character.hanzi === HANZI.xi);
    const lianWorkspace = initialWorkspace.charactersNeedingApproval.find((entry) => entry.character.hanzi === HANZI.lian);
    assert(xiWorkspace);
    assert(lianWorkspace);
    assert.equal(xiWorkspace.candidates.length, 1);
    assert.equal(lianWorkspace.candidates.length, 2);

    const xiUnresolved = initialWorkspace.unresolvedProps.filter((item) => item.characterHanzi === HANZI.xi);
    const lianUnresolved = initialWorkspace.unresolvedProps.filter((item) => item.characterHanzi === HANZI.lian);
    assert.equal(xiUnresolved.length, 2);
    assert.equal(lianUnresolved.length, 4);
    assert(xiUnresolved.every((item) => item.blockedDependencies.some((dependency) => dependency.text === HANZI.xi)));
    assert(lianUnresolved.some((item) => item.blockedDependencies.some((dependency) => dependency.text === HANZI.lianxi)));

    const blankCandidateResponse = await postWithBody<{ error: string }>(
      baseUrl,
      `/decompositions/candidates/${xiWorkspace.candidates[0]?.id}/approve`,
      {},
      422
    );
    assert.match(blankCandidateResponse.error, /Resolve all unresolved parts/);

    const createdCandidateWorkspace = await postWithBody<WorkspaceResponse["charactersNeedingApproval"][number]>(
      baseUrl,
      `/characters/${lianWorkspace.character.id}/decomposition-candidates`,
      {
        parts: [HANZI.silk, HANZI.east],
        notes: "Manual candidate for verification"
      },
      201
    );
    assert(createdCandidateWorkspace.candidates.length >= 3);

    for (const part of xiWorkspace.candidates[0]?.parts ?? []) {
      await postWithBody(baseUrl, `/decompositions/parts/${part.id}/resolve`, {
        action: part.text === HANZI.dot ? "create_known_character_prop" : "create_new_prop",
        name: part.text === HANZI.dot ? "Verify Dot" : `Verify ${part.text}`,
        shapeRef: part.text,
        meaningOrImage: `Verification prop for ${part.text}`,
        notes: "ticket 010 verification"
      });
    }

    const propsResponse = await fetch(`${baseUrl}/props?search=Verify`);
    assert.equal(propsResponse.status, 200);
    const propsPayload = await propsResponse.json() as {
      items: Array<{ id: string; name: string }>;
    };
    const existingProp = propsPayload.items.find((item) => item.name === `Verify ${HANZI.yi}`);
    assert(existingProp);

    const lianPrimaryCandidate = lianWorkspace.candidates[0];
    assert(lianPrimaryCandidate);
    const silkPart = lianPrimaryCandidate.parts.find((part) => part.text === HANZI.silk);
    const eastPart = lianPrimaryCandidate.parts.find((part) => part.text === HANZI.east);
    assert(silkPart);
    assert(eastPart);

    await postWithBody(baseUrl, `/decompositions/parts/${silkPart.id}/resolve`, {
      action: "match_existing_prop",
      propId: existingProp.id
    });

    await postWithBody(baseUrl, `/decompositions/parts/${eastPart.id}/resolve`, {
      action: "create_known_character_prop",
      name: "Verify East",
      shapeRef: HANZI.east,
      meaningOrImage: "Known character prop for east",
      notes: "ticket 010 verification"
    });

    const approvedXi = await postWithoutBody<WorkspaceResponse["charactersNeedingApproval"][number]>(
      baseUrl,
      `/decompositions/candidates/${xiWorkspace.candidates[0]?.id}/approve`
    );
    assert(approvedXi.approvedDecomposition);
    assert.equal(approvedXi.character.status, "ready");

    const approvedLian = await postWithoutBody<WorkspaceResponse["charactersNeedingApproval"][number]>(
      baseUrl,
      `/decompositions/candidates/${lianPrimaryCandidate.id}/approve`
    );
    assert(approvedLian.approvedDecomposition);
    assert.equal(approvedLian.character.status, "ready");
    assert.equal(approvedLian.candidates.length, 0);

    const finalWorkspaceResponse = await fetch(`${baseUrl}/decompositions/workspace`);
    assert.equal(finalWorkspaceResponse.status, 200);
    const finalWorkspace = await finalWorkspaceResponse.json() as WorkspaceResponse;
    assert(!finalWorkspace.charactersNeedingApproval.some((entry) => entry.character.hanzi === HANZI.xi));
    assert(!finalWorkspace.charactersNeedingApproval.some((entry) => entry.character.hanzi === HANZI.lian));

    console.log("Ticket 010 decomposition verification passed.");
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
