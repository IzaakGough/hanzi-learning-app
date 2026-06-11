import fs from "node:fs";
import path from "node:path";
import { createDatabaseConnection } from "../db/connection.js";
import { databaseFilePath } from "../db/config.js";
import { datasetExportDirectory } from "./paths.js";
import { exportDataset, type ExportDatasetName } from "../services/backup/export-service.js";

const supportedDatasets: ExportDatasetName[] = [
  "known_characters",
  "known_words",
  "props",
  "approved_decompositions"
];

function parseArguments() {
  const argumentsList = process.argv.slice(2);
  const datasets: ExportDatasetName[] = [];
  let outputDirectory = datasetExportDirectory;
  let sourceName = "hanzi-learning-app-local-export";

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (argument === "--dataset") {
      const dataset = argumentsList[index + 1] as ExportDatasetName | undefined;

      if (!dataset || !supportedDatasets.includes(dataset)) {
        throw new Error(`Unsupported dataset for --dataset: ${dataset ?? "<missing>"}`);
      }

      datasets.push(dataset);
      index += 1;
      continue;
    }

    if (argument === "--output-dir") {
      const outputPath = argumentsList[index + 1];

      if (!outputPath) {
        throw new Error("Missing value for --output-dir");
      }

      outputDirectory = path.resolve(outputPath);
      index += 1;
      continue;
    }

    if (argument === "--source-name") {
      const sourceNameValue = argumentsList[index + 1];

      if (!sourceNameValue) {
        throw new Error("Missing value for --source-name");
      }

      sourceName = sourceNameValue;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return {
    datasets: datasets.length > 0 ? datasets : supportedDatasets,
    outputDirectory,
    sourceName
  };
}

function main() {
  if (!fs.existsSync(databaseFilePath)) {
    throw new Error(`Database file does not exist yet: ${databaseFilePath}`);
  }

  const { datasets, outputDirectory, sourceName } = parseArguments();
  const database = createDatabaseConnection();

  try {
    const exports = datasets.map((dataset) => ({
      dataset,
      outputPath: exportDataset(database, dataset, {
        outputPath: path.join(outputDirectory, `${dataset}.json`),
        sourceName
      })
    }));

    console.log(JSON.stringify({
      databasePath: databaseFilePath,
      outputDirectory,
      exports
    }, null, 2));
  } finally {
    database.close();
  }
}

main();
