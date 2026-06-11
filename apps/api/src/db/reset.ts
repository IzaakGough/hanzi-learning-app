import fs from "node:fs";
import path from "node:path";
import { createDatabaseConnection } from "./connection.js";
import { databaseDirectory, databaseFilePath, mediaDirectory } from "./config.js";
import { runMigrations } from "./migrate.js";

function requireConfirmationFlag() {
  if (!process.argv.slice(2).includes("--yes")) {
    throw new Error("Refusing to reset without --yes");
  }
}

function resetTargets() {
  return [
    databaseFilePath,
    `${databaseFilePath}-shm`,
    `${databaseFilePath}-wal`
  ];
}

function ensureResetTargetsStayWithinDatabaseDirectory() {
  const resolvedDatabaseDirectory = path.resolve(databaseDirectory);

  for (const targetPath of [...resetTargets(), mediaDirectory]) {
    const resolvedTargetPath = path.resolve(targetPath);
    const relativeTargetPath = path.relative(resolvedDatabaseDirectory, resolvedTargetPath);

    if (
      relativeTargetPath === "" ||
      relativeTargetPath.startsWith("..") ||
      path.isAbsolute(relativeTargetPath)
    ) {
      throw new Error(`Unsafe reset target path: ${resolvedTargetPath}`);
    }
  }
}

function main() {
  requireConfirmationFlag();
  ensureResetTargetsStayWithinDatabaseDirectory();

  for (const targetPath of resetTargets()) {
    fs.rmSync(targetPath, { force: true });
  }

  fs.rmSync(mediaDirectory, { recursive: true, force: true });

  const database = createDatabaseConnection();

  try {
    runMigrations(database);
    console.log(JSON.stringify({
      databasePath: databaseFilePath,
      mediaDirectory,
      reset: true
    }, null, 2));
  } finally {
    database.close();
  }
}

main();
