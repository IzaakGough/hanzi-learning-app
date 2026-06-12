import fs from "node:fs";
import path from "node:path";
import {
  parseKnownCharactersImport,
  parseKnownWordsImport,
  parseLevelsImport,
  parsePinyinMappingsImport,
  parseStructuralDecompositionImport
} from "@hanzi-learning-app/shared";
import { exampleImportsDirectory } from "./paths.js";

function readJsonFile<T>(fileName: string) {
  const filePath = path.join(exampleImportsDirectory, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export function validateExampleFixtures() {
  parseKnownCharactersImport(readJsonFile("known_characters.json"));
  parseKnownWordsImport(readJsonFile("known_words.json"));
  parseLevelsImport(readJsonFile("levels.json"));
  parsePinyinMappingsImport(readJsonFile("pinyin_mappings.json"));
  parseStructuralDecompositionImport(readJsonFile(path.join("..", "structural", "chise_ids.json")));
}
