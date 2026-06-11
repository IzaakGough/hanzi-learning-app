import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { QueueItemType } from "@hanzi-learning-app/shared";

const verificationDatabasePath = path.join(
  os.tmpdir(),
  `hanzi-ticket-015-queue-${Date.now()}.sqlite`
);

interface QueueResponse {
  counts: Array<{
    type: QueueItemType;
    count: number;
  }>;
  items: Array<{
    id: string;
    type: QueueItemType;
    title: string;
    description: string | null;
    candidate?: {
      id: string;
    };
    part?: {
      partId: string;
      literalText: string;
      existingPropOptions: Array<{
        id: string;
        name: string;
      }>;
    };
    character?: {
      hanzi: string;
      status: string;
    };
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

function getCount(queue: QueueResponse, type: QueueItemType) {
  return queue.counts.find((count) => count.type === type)?.count ?? 0;
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

    const initialResponse = await fetch(`${baseUrl}/queue`);
    assert.equal(initialResponse.status, 200);
    const initialQueue = await initialResponse.json() as QueueResponse;

    assert.equal(initialQueue.counts.length, 5);
    assert(getCount(initialQueue, QueueItemType.DecompositionCandidate) >= 3);
    assert(getCount(initialQueue, QueueItemType.UnresolvedProp) >= 6);

    const xiUnresolvedItems = initialQueue.items.filter(
      (item) => item.type === QueueItemType.UnresolvedProp && item.title.startsWith("习 unresolved prop")
    );
    assert(xiUnresolvedItems.length >= 2);

    for (const item of xiUnresolvedItems) {
      await postWithBody<QueueResponse>(baseUrl, `/queue/items/${item.id}/actions`, {
        action: "resolve_unresolved_prop",
        resolution: {
          action: "create_new_prop",
          name: `Verify ${item.part?.literalText}`,
          shapeRef: item.part?.literalText ?? null,
          meaningOrImage: `Verification prop for ${item.part?.literalText}`,
          notes: "ticket 015 verification"
        }
      });
    }

    const afterResolutionResponse = await fetch(`${baseUrl}/queue`);
    assert.equal(afterResolutionResponse.status, 200);
    const afterResolutionQueue = await afterResolutionResponse.json() as QueueResponse;

    const xiCandidate = afterResolutionQueue.items.find(
      (item) => item.type === QueueItemType.DecompositionCandidate && item.title.startsWith("习 decomposition candidate")
    );
    assert(xiCandidate);

    const approvedQueue = await postWithBody<QueueResponse>(
      baseUrl,
      `/queue/items/${xiCandidate.id}/actions`,
      { action: "approve_decomposition_candidate" }
    );

    assert.equal(
      approvedQueue.items.some(
        (item) => item.type === QueueItemType.DecompositionCandidate && item.title.startsWith("习 decomposition candidate")
      ),
      false
    );
    assert.equal(
      approvedQueue.items.some(
        (item) => item.type === QueueItemType.UnresolvedProp && item.title.startsWith("习 unresolved prop")
      ),
      false
    );

    console.log("Ticket 015 queue verification passed.");
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
