import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseKnownCharactersImport,
  parseKnownWordsImport,
  parseLevelsImport,
  parsePinyinMappingsImport
} from "@hanzi-learning-app/shared";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const repoRoot = path.resolve(
  currentDirPath,
  "..",
  "..",
  "..",
  "..",
);

const examplesDirectory = path.resolve(
  repoRoot,
  "data",
  "imports",
  "examples",
);

function readJsonFile<T>(fileName: string) {
  const filePath = path.join(examplesDirectory, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export function validateExampleFixtures() {
  parseKnownCharactersImport(readJsonFile("known_characters.json"));
  parseKnownWordsImport(readJsonFile("known_words.json"));
  parseLevelsImport(readJsonFile("levels.json"));
  parsePinyinMappingsImport(readJsonFile("pinyin_mappings.json"));
}
