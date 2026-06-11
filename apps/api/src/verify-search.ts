import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";

const verificationDatabasePath = path.join(
  os.tmpdir(),
  `hanzi-ticket-007-${Date.now()}.sqlite`
);

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

    const hanziSearchResponse = await fetch(`${baseUrl}/search?q=${encodeURIComponent("学")}`);
    assert.equal(hanziSearchResponse.status, 200);
    const hanziSearch = await hanziSearchResponse.json() as {
      items: Array<{ id: string; kind: "character" | "word"; text: string }>;
    };

    assert(hanziSearch.items.some((item) => item.kind === "character" && item.text === "学"));
    assert(hanziSearch.items.some((item) => item.kind === "word" && item.text === "学生"));

    const meaningSearchResponse = await fetch(`${baseUrl}/search?q=${encodeURIComponent("hello")}`);
    assert.equal(meaningSearchResponse.status, 200);
    const meaningSearch = await meaningSearchResponse.json() as {
      items: Array<{ id: string; kind: "character" | "word"; text: string }>;
    };

    assert(meaningSearch.items.some((item) => item.kind === "word" && item.text === "你好"));

    const studentWord = hanziSearch.items.find((item) => item.kind === "word" && item.text === "学生");
    assert(studentWord);

    const wordDetailResponse = await fetch(`${baseUrl}/words/${studentWord.id}`);
    assert.equal(wordDetailResponse.status, 200);
    const wordDetail = await wordDetailResponse.json() as {
      simplified: string;
      componentCharacters: Array<{ hanzi: string }>;
      pinyinSource: string | null;
      meaningSource: string | null;
    };

    assert.equal(wordDetail.simplified, "学生");
    assert.deepEqual(wordDetail.componentCharacters.map((item) => item.hanzi), ["学", "生"]);
    assert.equal(wordDetail.pinyinSource, "derived");
    assert.equal(wordDetail.meaningSource, "derived");

    const characterItem = hanziSearch.items.find((item) => item.kind === "character" && item.text === "学");
    assert(characterItem);

    const characterDetailResponse = await fetch(`${baseUrl}/characters/${characterItem.id}`);
    assert.equal(characterDetailResponse.status, 200);
    const characterDetail = await characterDetailResponse.json() as {
      hanzi: string;
      linkedWords: Array<{ simplified: string }>;
      pinyinInitial: string | null;
      pinyinFinal: string | null;
      tone: string | null;
    };

    assert.equal(characterDetail.hanzi, "学");
    assert(characterDetail.linkedWords.some((item) => item.simplified === "学生"));
    assert.equal(characterDetail.pinyinInitial, "x");
    assert.equal(characterDetail.pinyinFinal, "ue");
    assert.equal(characterDetail.tone, "2");

    const lexicalUpdateResponse = await fetch(`${baseUrl}/words/${studentWord.id}/lexical`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pinyinDisplay: "xue2 sheng5",
        meaningPrimary: "learner",
        provenanceNote: "manual verification edit"
      })
    });
    assert.equal(lexicalUpdateResponse.status, 200);
    const updatedWord = await lexicalUpdateResponse.json() as {
      pinyinDisplay: string | null;
      pinyinSource: string | null;
      pinyinSourceRef: string | null;
      meaningPrimary: string | null;
      meaningSource: string | null;
      meaningSourceRef: string | null;
    };

    assert.equal(updatedWord.pinyinDisplay, "xue2 sheng5");
    assert.equal(updatedWord.pinyinSource, "manual");
    assert.equal(updatedWord.pinyinSourceRef, "manual verification edit");
    assert.equal(updatedWord.meaningPrimary, "learner");
    assert.equal(updatedWord.meaningSource, "manual");
    assert.equal(updatedWord.meaningSourceRef, "manual verification edit");

    const pinyinSearchResponse = await fetch(`${baseUrl}/search?q=${encodeURIComponent("sheng5")}`);
    assert.equal(pinyinSearchResponse.status, 200);
    const pinyinSearch = await pinyinSearchResponse.json() as {
      items: Array<{ id: string; kind: "character" | "word"; text: string }>;
    };

    assert(pinyinSearch.items.some((item) => item.kind === "word" && item.text === "学生"));

    console.log("Ticket 007 search verification passed.");
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
