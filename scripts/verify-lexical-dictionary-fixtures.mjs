import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSuspiciousGroups,
  choosePrimaryCandidate,
  compareStrings,
  countCodePoints,
  createOmittedCounts,
  isHanziOnlyText,
  parseCedictLine,
  sortDictionaryEntries
} from "./lib/lexical-dictionary/index.mjs";

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDirectory = path.dirname(currentFilePath);
const fixturesDirectory = path.join(scriptsDirectory, "fixtures");

function loadFixtureLines(fileName) {
  return fs.readFileSync(path.join(fixturesDirectory, fileName), "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith("#"));
}

function parseFixtureLines(lines) {
  const characterGroups = new Map();
  const wordGroups = new Map();
  const omittedEntries = [];

  lines.forEach((line, index) => {
    const parsed = parseCedictLine(line, index + 1);

    if (parsed === null) {
      return;
    }

    if (parsed.kind === "omitted") {
      omittedEntries.push(parsed);
      return;
    }

    const groups = countCodePoints(parsed.simplified) === 1 ? characterGroups : wordGroups;
    const existing = groups.get(parsed.simplified) ?? [];
    existing.push(parsed);
    groups.set(parsed.simplified, existing);
  });

  const characters = sortDictionaryEntries(
    [...characterGroups.entries()].map(([text, candidates]) => {
      const selected = choosePrimaryCandidate(candidates);
      return {
        text,
        pinyinDisplay: selected.pinyinDisplay,
        meaningPrimary: selected.meaningPrimary
      };
    })
  );
  const words = sortDictionaryEntries(
    [...wordGroups.entries()].map(([text, candidates]) => {
      const selected = choosePrimaryCandidate(candidates);
      return {
        text,
        pinyinDisplay: selected.pinyinDisplay,
        meaningPrimary: selected.meaningPrimary
      };
    })
  );

  return {
    characters,
    words,
    omittedEntries,
    suspiciousGroups: [
      ...buildSuspiciousGroups(characterGroups, "character"),
      ...buildSuspiciousGroups(wordGroups, "word")
    ]
  };
}

function main() {
  const phase1 = parseFixtureLines(loadFixtureLines("lexical-dictionary-phase1.txt"));
  const phase1Counts = createOmittedCounts(phase1.omittedEntries);

  assert(phase1.characters.some((entry) => entry.text === "学"));
  assert(phase1.words.some((entry) => entry.text === "学生"));
  assert(!phase1.words.some((entry) => entry.text === "3D打印"));
  assert(!phase1.words.some((entry) => entry.text === "A片"));
  assert(!phase1.words.some((entry) => entry.text === "一不做，二不休"));
  assert.equal(phase1Counts.non_hanzi_headword, 3);
  assert.equal(phase1Counts.non_standard_pinyin, 1);
  assert.equal(phase1Counts.invalid_format, 1);
  assert.equal(phase1Counts.missing_meaning, 1);
  assert(phase1.omittedEntries.some((entry) => entry.reason === "non_standard_pinyin" && entry.text === "绿帽"));
  assert(phase1.omittedEntries.filter((entry) => entry.reason === "non_standard_pinyin").every((entry) => isHanziOnlyText(entry.text)));

  const phase2 = parseFixtureLines(loadFixtureLines("lexical-dictionary-phase2.txt"));
  const student = phase2.words.find((entry) => entry.text === "学生");
  const expert = phase2.words.find((entry) => entry.text === "行家");
  const conjunction = phase2.characters.find((entry) => entry.text === "和");
  const squad = phase2.characters.find((entry) => entry.text === "班");
  const boundForm = phase2.characters.find((entry) => entry.text === "素");

  assert.deepEqual(student, {
    text: "学生",
    pinyinDisplay: "xue2 sheng5",
    meaningPrimary: "student"
  });
  assert.deepEqual(expert, {
    text: "行家",
    pinyinDisplay: "xing2 jia1",
    meaningPrimary: "expert"
  });
  assert.deepEqual(conjunction, {
    text: "和",
    pinyinDisplay: "he2",
    meaningPrimary: "and"
  });
  assert.deepEqual(squad, {
    text: "班",
    pinyinDisplay: "ban1",
    meaningPrimary: "class"
  });
  assert.deepEqual(boundForm, {
    text: "素",
    pinyinDisplay: "su4",
    meaningPrimary: "(bound form) element"
  });

  const phase2Suspicious = phase2.suspiciousGroups.sort((left, right) => compareStrings(left.text, right.text));
  assert(phase2Suspicious.some((group) => group.text === "学生" && group.selected.penaltyTags.length === 0));
  assert(
    phase2Suspicious.some((group) => (
      group.text === "学生" &&
      group.alternates.some((alternate) => alternate.penaltyTags.includes("redirect"))
    ))
  );
  assert(
    phase2Suspicious.some((group) => (
      group.text === "和" &&
      group.alternates.some((alternate) => alternate.penaltyTags.includes("pronunciation_note"))
    ))
  );
  assert(
    phase2Suspicious.some((group) => (
      group.text === "班" &&
      group.alternates.some((alternate) => alternate.penaltyTags.includes("classifier_only"))
    ))
  );

  console.log("Lexical dictionary fixture verification passed.");
}

main();
