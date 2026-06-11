import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseKnownCharactersImport,
  parseKnownWordsImport,
  parseLevelsImport,
  parsePinyinMappingsImport
} from "../packages/shared/dist/index.js";
import { normalizePlecoCharacters, normalizePlecoWords } from "./lib/normalize-pleco.mjs";
import { normalizeNotionLevels, normalizeNotionMappings } from "./lib/normalize-notion.mjs";
import { writeJsonFile } from "./lib/normalization-helpers.mjs";

const currentFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFilePath), "..");
const rawExamplesDirectory = path.join(repoRoot, "data", "imports", "raw-examples");
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "hanzi-normalizers-verify-"));

function main() {
  try {
    const characters = normalizePlecoCharacters({
      inputPath: path.join(rawExamplesDirectory, "pleco-characters.tsv"),
      sourceName: "pleco-characters-normalized",
      options: {}
    });
    const words = normalizePlecoWords({
      inputPath: path.join(rawExamplesDirectory, "pleco-words.tsv"),
      sourceName: "pleco-words-normalized",
      options: {}
    });
    const levels = normalizeNotionLevels({
      inputPath: path.join(rawExamplesDirectory, "notion-levels.csv"),
      sourceName: "mandarin-blueprint-levels-normalized",
      options: {}
    });
    const mappings = normalizeNotionMappings({
      inputPath: path.join(rawExamplesDirectory, "notion-pinyin-mappings.csv"),
      sourceName: "mandarin-blueprint-pinyin-mappings",
      options: {}
    });

    writeJsonFile(path.join(tempDirectory, "known_characters.json"), characters);
    writeJsonFile(path.join(tempDirectory, "known_words.json"), words);
    writeJsonFile(path.join(tempDirectory, "levels.json"), levels);
    writeJsonFile(path.join(tempDirectory, "pinyin_mappings.json"), mappings);

    assert.equal(parseKnownCharactersImport(characters).items.length, 2);
    assert.equal(parseKnownWordsImport(words).items.length, 2);
    assert.equal(parseLevelsImport(levels).items.length, 2);
    assert.equal(parsePinyinMappingsImport(mappings).items.length, 5);

    assert.deepEqual(characters.items[0], {
      hanzi: "你",
      pinyinDisplay: "ni3",
      meaningPrimary: "you",
      source: "pleco_import",
      sourceRef: "Pleco Characters"
    });

    assert.deepEqual(words.items[0], {
      simplified: "你好",
      pinyinDisplay: "ni3 hao3",
      meaningPrimary: "hello",
      source: "pleco_import",
      sourceRef: "Pleco Words"
    });

    assert.deepEqual(levels.items[0], {
      course: "mandarin-blueprint",
      sequenceNumber: 21,
      title: "Level 21",
      characters: [{ hanzi: "学" }, { hanzi: "生" }],
      words: [{ simplified: "学生" }],
      notes: "First example level"
    });

    assert.deepEqual(mappings.items[3], {
      kind: "initial",
      symbol: "null",
      mappedValue: "Null Actor"
    });

    console.log(`Raw normalization verification passed using ${tempDirectory}`);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main();
