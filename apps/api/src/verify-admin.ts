import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { createDatabaseConnection } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";
import { createApp } from "./app.js";
import { exampleImportsDirectory } from "./imports/paths.js";
import { loadNormalizedImportFile } from "./imports/load-import-file.js";
import { runNormalizedImport } from "./services/imports/import-service.js";

async function main() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hanzi-ticket-005-"));
  const databasePath = path.join(tempDirectory, "verify.sqlite");
  process.env.HANZI_DB_PATH = databasePath;

  const database = createDatabaseConnection();
  runMigrations(database);

  const mappingsImport = loadNormalizedImportFile(
    path.join(exampleImportsDirectory, "pinyin_mappings.json")
  );
  runNormalizedImport(database, mappingsImport);

  const app = createApp(database);
  const server = createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));

  try {
    const address = server.address();
    assert(address && typeof address === "object");

    const baseUrl = `http://127.0.0.1:${address.port}`;

    const mappingsResponse = await fetch(`${baseUrl}/mappings`);
    assert.equal(mappingsResponse.status, 200);
    const mappingsPayload = await mappingsResponse.json() as {
      items: Array<{ id: string; symbol: string; mappedValue: string; notes: string | null }>;
    };

    assert(mappingsPayload.items.some((item) => item.symbol === "null"));

    const createMappingResponse = await fetch(`${baseUrl}/mappings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "final",
        symbol: "ong",
        mappedValue: "Bell Gong",
        notes: "Added by verification"
      })
    });
    assert.equal(createMappingResponse.status, 201);

    const createdMapping = await createMappingResponse.json() as { id: string };

    const updateMappingResponse = await fetch(`${baseUrl}/mappings/${createdMapping.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "final",
        symbol: "ong",
        mappedValue: "Temple Gong",
        notes: "Updated by verification"
      })
    });
    assert.equal(updateMappingResponse.status, 200);

    const createPropResponse = await fetch(`${baseUrl}/props`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Sun Wheel",
        type: "component",
        shapeRef: "日",
        meaningOrImage: "A bright wheel blazing across the sky",
        notes: "Starter prop",
        isActive: true
      })
    });
    assert.equal(createPropResponse.status, 201);

    const createdProp = await createPropResponse.json() as { id: string };

    const searchPropsResponse = await fetch(`${baseUrl}/props?search=bright`);
    assert.equal(searchPropsResponse.status, 200);
    const searchPropsPayload = await searchPropsResponse.json() as {
      items: Array<{ id: string; name: string }>;
    };
    assert(searchPropsPayload.items.some((item) => item.id === createdProp.id));

    const updatePropResponse = await fetch(`${baseUrl}/props/${createdProp.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Sun Wheel",
        type: "component",
        shapeRef: "日",
        meaningOrImage: "A blazing sun disk",
        notes: "Edited by verification",
        isActive: false
      })
    });
    assert.equal(updatePropResponse.status, 200);

    console.log("Ticket 005 admin verification passed.");
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
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

void main();
