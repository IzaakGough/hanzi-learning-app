import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const repoRoot = path.resolve(currentDirectory, "..", "..");

function parseArguments(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    const optionName = argument.slice(2);
    const optionValue = argv[index + 1];

    if (!optionValue || optionValue.startsWith("--")) {
      throw new Error(`Missing value for --${optionName}`);
    }

    options[optionName] = optionValue;
    index += 1;
  }

  return options;
}

export function resolveRepoPath(relativePath) {
  return path.resolve(repoRoot, relativePath);
}

export function getRequiredOption(options, name) {
  const value = options[name];

  if (!value) {
    throw new Error(`Missing required option --${name}`);
  }

  return value;
}

export function readUtf8File(filePath) {
  return fs.readFileSync(path.resolve(filePath), "utf8");
}

export function writeJsonFile(filePath, payload) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function requireValue(row, key, contextLabel) {
  const value = row[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${contextLabel} is missing required column value "${key}".`);
  }

  return value.trim();
}

export function optionalValue(row, key) {
  const value = row[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function splitListCell(value) {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function createCliRunner(normalize, defaults) {
  return function runCli(argv) {
    const options = parseArguments(argv);
    const inputPath = getRequiredOption(options, "input");
    const outputPath = getRequiredOption(options, "output");
    const sourceName = options["source-name"] ?? defaults.sourceName;

    const payload = normalize({
      inputPath,
      sourceName,
      options
    });

    writeJsonFile(outputPath, payload);
    console.log(`Wrote ${payload.importType} to ${path.resolve(outputPath)}`);
  };
}
