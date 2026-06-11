import path from "node:path";
import { createDatabaseConnection } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";
import { loadNormalizedImportFile } from "./load-import-file.js";
import { exampleImportsDirectory } from "./paths.js";
import { runNormalizedImport } from "../services/imports/import-service.js";

const defaultImportFileNames = [
  "known_characters.json",
  "known_words.json",
  "levels.json",
  "pinyin_mappings.json"
];

function resolveInputPaths(argumentsList: string[]) {
  if (argumentsList.length > 0) {
    return argumentsList.map((inputPath) => path.resolve(inputPath));
  }

  return defaultImportFileNames.map((fileName) => path.join(exampleImportsDirectory, fileName));
}

function main() {
  const inputPaths = resolveInputPaths(process.argv.slice(2));
  const database = createDatabaseConnection();

  try {
    runMigrations(database);

    let failed = false;

    for (const inputPath of inputPaths) {
      const payload = loadNormalizedImportFile(inputPath);
      const summary = runNormalizedImport(database, payload);

      console.log(JSON.stringify({
        filePath: inputPath,
        ...summary
      }, null, 2));

      if (summary.status === "failed") {
        failed = true;
      }
    }

    if (failed) {
      process.exitCode = 1;
    }
  } finally {
    database.close();
  }
}

main();
