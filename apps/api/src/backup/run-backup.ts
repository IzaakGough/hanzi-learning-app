import fs from "node:fs";
import path from "node:path";
import { createDatabaseConnection } from "../db/connection.js";
import { databaseFilePath } from "../db/config.js";
import { backupExportDirectory } from "../exports/paths.js";
import { createDatabaseBackup, timestampFileFragment } from "../services/backup/backup-service.js";

function parseOutputPath() {
  const argumentsList = process.argv.slice(2);

  for (let index = 0; index < argumentsList.length; index += 1) {
    if (argumentsList[index] === "--output") {
      const outputPath = argumentsList[index + 1];

      if (!outputPath) {
        throw new Error("Missing value for --output");
      }

      return path.resolve(outputPath);
    }
  }

  return path.join(
    backupExportDirectory,
    `hanzi-learning-app-backup-${timestampFileFragment()}.sqlite`
  );
}

function main() {
  if (!fs.existsSync(databaseFilePath)) {
    throw new Error(`Database file does not exist yet: ${databaseFilePath}`);
  }

  const outputPath = parseOutputPath();
  const database = createDatabaseConnection();

  try {
    const backupPath = createDatabaseBackup(database, outputPath);
    console.log(JSON.stringify({
      databasePath: databaseFilePath,
      backupPath
    }, null, 2));
  } finally {
    database.close();
  }
}

main();
