import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";

async function main() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hanzi-ticket-005-"));
  const databasePath = path.join(tempDirectory, "verify.sqlite");
  process.env.HANZI_DB_PATH = databasePath;

  const { createDatabaseConnection } = await import("./db/connection.js");
  const { runMigrations } = await import("./db/migrate.js");
  const { createApp } = await import("./app.js");
  const { exampleImportsDirectory } = await import("./imports/paths.js");
  const { loadNormalizedImportFile } = await import("./imports/load-import-file.js");
  const { runNormalizedImport } = await import("./services/imports/import-service.js");

  const database = createDatabaseConnection();
  runMigrations(database);

  const mappingsImport = loadNormalizedImportFile(
    path.join(exampleImportsDirectory, "pinyin_mappings.json")
  );
  runNormalizedImport(database, mappingsImport);
  const charactersImport = loadNormalizedImportFile(
    path.join(exampleImportsDirectory, "known_characters.json")
  );
  runNormalizedImport(database, charactersImport);

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
        isActive: true
      })
    });
    assert.equal(createPropResponse.status, 201);

    const createdProp = await createPropResponse.json() as { id: string };

    const searchPropsResponse = await fetch(`${baseUrl}/props?search=Sun`);
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
        isActive: false
      })
    });
    assert.equal(updatePropResponse.status, 200);

    const invalidKnownCharacterPropResponse = await fetch(`${baseUrl}/props`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Goat Horns",
        type: "known_character",
        shapeRef: "丷",
        isActive: true
      })
    });
    assert.equal(invalidKnownCharacterPropResponse.status, 422);

    const invalidShapeRefResponse = await fetch(`${baseUrl}/props`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Invalid Shape Ref",
        type: "component",
        shapeRef: "AB",
        isActive: true
      })
    });
    assert.equal(invalidShapeRefResponse.status, 400);

    const validKnownCharacterPropResponse = await fetch(`${baseUrl}/props`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "You Character",
        type: "known_character",
        shapeRef: "你",
        isActive: true
      })
    });
    assert.equal(validKnownCharacterPropResponse.status, 201);

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
