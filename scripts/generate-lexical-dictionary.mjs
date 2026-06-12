import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPreview,
  buildSuspiciousGroups,
  choosePrimaryCandidate,
  compareStrings,
  countCodePoints,
  createOmittedCounts,
  defaultSourceName,
  parseCedictLine,
  previewLimit,
  sortDictionaryEntries
} from "./lib/lexical-dictionary/index.mjs";

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDirectory = path.dirname(currentFilePath);
const repoRoot = path.resolve(scriptsDirectory, "..");

const defaultInputPath = path.join(repoRoot, "data", "dictionaries", "raw", "cc_cedict.u8");
const defaultOutputPath = path.join(repoRoot, "data", "dictionaries", "lexical_dictionary.json");
const defaultReportPath = path.join(repoRoot, "data", "dictionaries", "lexical_dictionary_report.json");

function parseArgs(argv) {
  const options = {
    input: defaultInputPath,
    output: defaultOutputPath,
    reportOutput: defaultReportPath,
    sourceName: defaultSourceName
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];

    if (argument === "--input" && next) {
      options.input = path.resolve(next);
      index += 1;
      continue;
    }

    if (argument === "--output" && next) {
      options.output = path.resolve(next);
      index += 1;
      continue;
    }

    if (argument === "--report-output" && next) {
      options.reportOutput = path.resolve(next);
      index += 1;
      continue;
    }

    if (argument === "--source-name" && next) {
      options.sourceName = next;
      index += 1;
      continue;
    }

    if (argument === "--help") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node ./scripts/generate-lexical-dictionary.mjs [options]

Options:
  --input <path>          CC-CEDICT source file. Defaults to data/dictionaries/raw/cc_cedict.u8
  --output <path>         Generated dictionary JSON path.
  --report-output <path>  Generated report JSON path.
  --source-name <name>    Derived sourceName written into the dictionary artifact.
`);
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(options.input)) {
    throw new Error(`CC-CEDICT source file not found: ${options.input}`);
  }

  const raw = fs.readFileSync(options.input, "utf8");
  const lines = raw.split(/\r?\n/u);
  const characterGroups = new Map();
  const wordGroups = new Map();
  const omittedEntries = [];
  let upstreamEntryCount = 0;

  lines.forEach((line, index) => {
    const parsed = parseCedictLine(line, index + 1);

    if (parsed === null) {
      return;
    }

    upstreamEntryCount += 1;

    if (parsed.kind === "omitted") {
      omittedEntries.push(parsed);
      return;
    }

    const targetGroups = countCodePoints(parsed.simplified) === 1 ? characterGroups : wordGroups;
    const existing = targetGroups.get(parsed.simplified) ?? [];
    existing.push(parsed);
    targetGroups.set(parsed.simplified, existing);
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

  const dictionary = {
    sourceName: options.sourceName,
    characters,
    words
  };

  writeJsonFile(options.output, dictionary);

  const dictionaryFileSizeBytes = fs.statSync(options.output).size;
  const suspiciousGroups = [
    ...buildSuspiciousGroups(characterGroups, "character"),
    ...buildSuspiciousGroups(wordGroups, "word")
  ];
  const omittedCounts = createOmittedCounts(omittedEntries);
  const nonStandardPinyinPreviewItems = omittedEntries
    .filter((entry) => entry.reason === "non_standard_pinyin")
    .map((entry) => ({
      text: entry.text,
      rawPinyin: entry.rawPinyin,
      lineNumber: entry.lineNumber
    }));
  const report = {
    sourceName: options.sourceName,
    source: {
      filePath: path.relative(repoRoot, options.input).replaceAll("\\", "/"),
      fileSizeBytes: fs.statSync(options.input).size,
      upstreamEntryCount
    },
    outputs: {
      dictionaryPath: path.relative(repoRoot, options.output).replaceAll("\\", "/"),
      reportPath: path.relative(repoRoot, options.reportOutput).replaceAll("\\", "/"),
      generatedCharacterCount: characters.length,
      generatedWordCount: words.length,
      dictionaryFileSizeBytes
    },
    omittedCounts,
    omittedPreview: buildPreview(
      nonStandardPinyinPreviewItems,
      (left, right) => (
        compareStrings(left.text, right.text) ||
        compareStrings(left.rawPinyin, right.rawPinyin) ||
        left.lineNumber - right.lineNumber
      ),
      previewLimit
    ),
    suspiciousGroupsPreview: buildPreview(
      suspiciousGroups,
      (left, right) => (
        compareStrings(left.kind, right.kind) ||
        compareStrings(left.text, right.text)
      ),
      previewLimit
    )
  };

  writeJsonFile(options.reportOutput, report);

  console.log(
    `Generated ${characters.length} character entries and ${words.length} word entries from ${upstreamEntryCount} CC-CEDICT lines.`
  );
}

main();
