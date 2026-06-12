import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isHanziOnlyText, omissionReasons } from "./lib/lexical-dictionary/index.mjs";

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDirectory = path.dirname(currentFilePath);
const repoRoot = path.resolve(scriptsDirectory, "..");

const dictionaryPath = path.join(repoRoot, "data", "dictionaries", "lexical_dictionary.json");
const reportPath = path.join(repoRoot, "data", "dictionaries", "lexical_dictionary_report.json");

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertEntryShape(entry) {
  assert.equal(typeof entry.text, "string");
  assert.match(entry.text, /\S/u);
  assert(isHanziOnlyText(entry.text), `Expected Hanzi-only dictionary text, got ${entry.text}.`);
  assert.equal(typeof entry.pinyinDisplay, "string");
  assert.match(entry.pinyinDisplay, /^[A-Za-z\u00fc ]+[1-5](?: [A-Za-z\u00fc]+[1-5])*$/u);
  assert.equal(typeof entry.meaningPrimary, "string");
  assert.match(entry.meaningPrimary, /\S/u);
}

function assertSortedUnique(entries) {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    assertEntryShape(entry);

    if (index === 0) {
      continue;
    }

    assert(entry.text > entries[index - 1].text, "Dictionary entries must be sorted and unique by text.");
  }
}

function main() {
  assert(fs.existsSync(dictionaryPath), `Dictionary artifact missing at ${dictionaryPath}.`);
  assert(fs.existsSync(reportPath), `Dictionary report missing at ${reportPath}.`);

  const dictionary = readJsonFile(dictionaryPath);
  const report = readJsonFile(reportPath);

  assert.equal(dictionary.sourceName, "cc_cedict_generated_v2");
  assert(Array.isArray(dictionary.characters));
  assert(Array.isArray(dictionary.words));
  assert(dictionary.characters.length > 0);
  assert(dictionary.words.length > 0);
  assertSortedUnique(dictionary.characters);
  assertSortedUnique(dictionary.words);

  assert.equal(report.sourceName, dictionary.sourceName);
  assert.equal(report.outputs.generatedCharacterCount, dictionary.characters.length);
  assert.equal(report.outputs.generatedWordCount, dictionary.words.length);
  assert.equal(
    report.outputs.dictionaryFileSizeBytes,
    fs.statSync(dictionaryPath).size,
    "Report dictionary file size must match the artifact on disk."
  );
  assert.equal(typeof report.source.upstreamEntryCount, "number");
  assert(report.source.upstreamEntryCount >= dictionary.characters.length + dictionary.words.length);
  assert.equal(typeof report.omittedCounts, "object");
  assert.equal(typeof report.omittedPreview.totalCount, "number");
  assert.equal(typeof report.suspiciousGroupsPreview.totalCount, "number");
  assert(Array.isArray(report.omittedPreview.items));
  assert(Array.isArray(report.suspiciousGroupsPreview.items));
  omissionReasons.forEach((reason) => {
    assert.equal(typeof report.omittedCounts[reason], "number", `Missing omitted count for ${reason}.`);
  });

  report.omittedPreview.items.forEach((item) => {
    assert.equal(typeof item.text, "string");
    assert.equal(typeof item.rawPinyin, "string");
    assert.equal(typeof item.lineNumber, "number");
    assert(isHanziOnlyText(item.text), `Expected omitted preview to be Hanzi-only, got ${item.text}.`);
  });

  report.suspiciousGroupsPreview.items.forEach((group) => {
    assert.equal(typeof group.text, "string");
    assert(isHanziOnlyText(group.text), `Expected suspicious group text to be Hanzi-only, got ${group.text}.`);
    assert.equal(typeof group.selected.lineNumber, "number");
    assert(Array.isArray(group.selected.penaltyTags));
    group.selected.penaltyTags.forEach((tag) => assert.equal(typeof tag, "string"));
    assert(Array.isArray(group.alternates));
    group.alternates.forEach((alternate) => {
      assert.equal(typeof alternate.lineNumber, "number");
      assert(Array.isArray(alternate.penaltyTags));
      alternate.penaltyTags.forEach((tag) => assert.equal(typeof tag, "string"));
    });
  });

  console.log("Lexical dictionary artifact verification passed.");
}

main();
