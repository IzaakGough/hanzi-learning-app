import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";

const verificationDatabasePath = path.join(
  os.tmpdir(),
  `hanzi-ticket-019-${Date.now()}.sqlite`
);

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

    const customCharacterResponse = await fetch(`${baseUrl}/characters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hanzi: "\u68ee",
        pinyinDisplay: "sen1",
        meaningPrimary: "forest",
        notes: "Custom verification character"
      })
    });
    assert.equal(customCharacterResponse.status, 201);
    const customCharacter = await customCharacterResponse.json() as {
      id: string;
      hanzi: string;
      source: string;
      sourceRef: string | null;
      levelId: string | null;
      status: string;
      blockedReason: string | null;
    };

    assert.equal(customCharacter.hanzi, "\u68ee");
    assert.equal(customCharacter.source, "manual");
    assert.equal(customCharacter.sourceRef, "extra/custom");
    assert.equal(customCharacter.levelId, null);
    assert.equal(customCharacter.status, "blocked");
    assert.equal(customCharacter.blockedReason, "missing_approved_decomposition");

    const customWordResponse = await fetch(`${baseUrl}/words`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        simplified: "\u68ee\u4f60",
        pinyinDisplay: "sen1 ni3",
        meaningPrimary: "forest you",
        notes: "Custom verification word"
      })
    });
    assert.equal(customWordResponse.status, 201);
    const customWord = await customWordResponse.json() as {
      id: string;
      simplified: string;
      source: string;
      sourceRef: string | null;
      levelId: string | null;
      status: string;
      blockedReason: string | null;
      componentCharacters: Array<{ hanzi: string }>;
    };

    assert.equal(customWord.simplified, "\u68ee\u4f60");
    assert.equal(customWord.source, "manual");
    assert.equal(customWord.sourceRef, "extra/custom");
    assert.equal(customWord.levelId, null);
    assert.equal(customWord.status, "blocked");
    assert.equal(customWord.blockedReason, "component_characters_unlearned");
    assert.deepEqual(customWord.componentCharacters.map((item) => item.hanzi), ["\u68ee", "\u4f60"]);

    const placeholderWordResponse = await fetch(`${baseUrl}/words`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        simplified: "\u9f98\u4f60",
        pinyinDisplay: "da2 ni3",
        meaningPrimary: "dragon you",
        notes: null
      })
    });
    assert.equal(placeholderWordResponse.status, 201);

    const placeholderCharacter = database.prepare(`
      SELECT source, source_ref, level_id, status
      FROM characters
      WHERE hanzi = @hanzi
    `).get({
      hanzi: "\u9f98"
    }) as {
      source: string;
      source_ref: string | null;
      level_id: string | null;
      status: string;
    } | undefined;

    assert(placeholderCharacter);
    assert.equal(placeholderCharacter.source, "manual");
    assert.equal(placeholderCharacter.source_ref, "extra/custom");
    assert.equal(placeholderCharacter.level_id, null);
    assert.equal(placeholderCharacter.status, "blocked");

    const candidateResponse = await fetch(`${baseUrl}/characters/${customCharacter.id}/decomposition-candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parts: ["tree", "tree", "tree"],
        notes: "Custom verification decomposition"
      })
    });
    assert.equal(candidateResponse.status, 201);
    const candidateWorkspace = await candidateResponse.json() as {
      character: { status: string };
      candidates: Array<{
        id: string;
        parts: Array<{ id: string; text: string }>;
      }>;
    };

    assert.equal(candidateWorkspace.character.status, "blocked");
    assert.equal(candidateWorkspace.candidates.length, 1);

    const candidate = candidateWorkspace.candidates[0];

    for (const [index, part] of candidate.parts.entries()) {
      const resolveResponse = await fetch(`${baseUrl}/decompositions/parts/${part.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_new_prop",
          name: `Tree ${index + 1}`,
          shapeRef: part.text,
          meaningOrImage: `Custom verification prop ${index + 1}`,
          notes: "Created during custom item verification"
        })
      });
      assert.equal(resolveResponse.status, 200);
    }

    const approveResponse = await fetch(`${baseUrl}/decompositions/candidates/${candidate.id}/approve`, {
      method: "POST"
    });
    assert.equal(approveResponse.status, 200);
    const approvedWorkspace = await approveResponse.json() as {
      character: { status: string; blockedReason: string | null };
    };

    assert.equal(approvedWorkspace.character.status, "ready");
    assert.equal(approvedWorkspace.character.blockedReason, null);

    const learnResponse = await fetch(`${baseUrl}/learning/characters/${customCharacter.id}/learned`, {
      method: "POST"
    });
    assert.equal(learnResponse.status, 200);

    const updatedCustomWordResponse = await fetch(`${baseUrl}/words/${customWord.id}`);
    assert.equal(updatedCustomWordResponse.status, 200);
    const updatedCustomWord = await updatedCustomWordResponse.json() as {
      status: string;
      blockedReason: string | null;
    };

    assert.equal(updatedCustomWord.status, "ready");
    assert.equal(updatedCustomWord.blockedReason, null);

    const dueBeforeGradeResponse = await fetch(`${baseUrl}/reviews/characters/due`);
    assert.equal(dueBeforeGradeResponse.status, 200);
    const dueBeforeGrade = await dueBeforeGradeResponse.json() as {
      items: Array<{ id: string }>;
    };

    assert(dueBeforeGrade.items.some((item) => item.id === customCharacter.id));

    const gradeResponse = await fetch(`${baseUrl}/reviews/characters/${customCharacter.id}/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade: "good" })
    });
    assert.equal(gradeResponse.status, 200);
    const gradedReview = await gradeResponse.json() as {
      reviewState: { reviewCount: number; stability: number | null; difficulty: number | null };
    };

    assert.equal(gradedReview.reviewState.reviewCount, 1);
    assert.notEqual(gradedReview.reviewState.stability, null);
    assert.notEqual(gradedReview.reviewState.difficulty, null);

    const resetResponse = await fetch(`${baseUrl}/reviews/characters/${customCharacter.id}/reset`, {
      method: "POST"
    });
    assert.equal(resetResponse.status, 200);
    const resetReview = await resetResponse.json() as {
      reviewState: {
        dueAt: string;
        stability: number | null;
        difficulty: number | null;
        lastReviewedAt: string | null;
        reviewCount: number;
        lapseCount: number;
      };
    };

    assert.equal(resetReview.reviewState.stability, null);
    assert.equal(resetReview.reviewState.difficulty, null);
    assert.equal(resetReview.reviewState.lastReviewedAt, null);
    assert.equal(resetReview.reviewState.reviewCount, 0);
    assert.equal(resetReview.reviewState.lapseCount, 0);
    assert(Math.abs(Date.now() - new Date(resetReview.reviewState.dueAt).getTime()) < 5_000);

    const archiveResponse = await fetch(`${baseUrl}/characters/${customCharacter.id}/archive`, {
      method: "POST"
    });
    assert.equal(archiveResponse.status, 200);
    const archivedCharacter = await archiveResponse.json() as {
      status: string;
      archivedAt: string | null;
    };

    assert.equal(archivedCharacter.status, "archived");
    assert.notEqual(archivedCharacter.archivedAt, null);

    const reviewHistoryCount = database.prepare(`
      SELECT COUNT(*) AS count
      FROM review_events
      WHERE item_kind = 'character' AND item_id = ?
    `).get(customCharacter.id) as { count: number };
    assert.equal(reviewHistoryCount.count, 1);

    const dueWhileArchivedResponse = await fetch(`${baseUrl}/reviews/characters/due`);
    assert.equal(dueWhileArchivedResponse.status, 200);
    const dueWhileArchived = await dueWhileArchivedResponse.json() as {
      items: Array<{ id: string }>;
    };

    assert(!dueWhileArchived.items.some((item) => item.id === customCharacter.id));

    const restoreResponse = await fetch(`${baseUrl}/characters/${customCharacter.id}/restore`, {
      method: "POST"
    });
    assert.equal(restoreResponse.status, 200);
    const restoredCharacter = await restoreResponse.json() as {
      status: string;
      archivedAt: string | null;
      learnedAt: string | null;
    };

    assert.equal(restoredCharacter.status, "learned");
    assert.equal(restoredCharacter.archivedAt, null);
    assert.notEqual(restoredCharacter.learnedAt, null);

    const dueAfterRestoreResponse = await fetch(`${baseUrl}/reviews/characters/due`);
    assert.equal(dueAfterRestoreResponse.status, 200);
    const dueAfterRestore = await dueAfterRestoreResponse.json() as {
      items: Array<{ id: string }>;
    };

    assert(dueAfterRestore.items.some((item) => item.id === customCharacter.id));

    console.log("Ticket 019 custom item verification passed.");
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
