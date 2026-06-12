import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeJsonFile } from "./lib/normalization-helpers.mjs";

const currentFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFilePath), "..");

const binaryOperators = new Set(["⿰", "⿱", "⿴", "⿵", "⿶", "⿷", "⿸", "⿹", "⿺", "⿻"]);
const ternaryOperators = new Set(["⿲", "⿳"]);
const supportedOperators = new Set([...binaryOperators, ...ternaryOperators]);

function parseArguments(argv) {
  const options = {
    input: null,
    output: null,
    sourceName: "chise_ids_curated_v1"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === "--input" && nextValue) {
      options.input = nextValue;
      index += 1;
      continue;
    }

    if (argument === "--output" && nextValue) {
      options.output = nextValue;
      index += 1;
      continue;
    }

    if (argument === "--source-name" && nextValue) {
      options.sourceName = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${argument}`);
  }

  if (!options.input || !options.output) {
    throw new Error("Usage: node ./scripts/normalize-chise-ids.mjs --input <file> --output <file> [--source-name <name>]");
  }

  return options;
}

function tokenizeIds(ids) {
  const tokens = [];

  for (let index = 0; index < ids.length;) {
    const current = ids[index];

    if (current === "&") {
      const endIndex = ids.indexOf(";", index);

      if (endIndex === -1) {
        throw new Error(`Unterminated CHISE entity in IDS: ${ids}`);
      }

      tokens.push(ids.slice(index, endIndex + 1));
      index = endIndex + 1;
      continue;
    }

    const codePoint = ids.codePointAt(index);

    if (codePoint == null) {
      break;
    }

    const token = String.fromCodePoint(codePoint);
    tokens.push(token);
    index += token.length;
  }

  return tokens;
}

function parseNode(tokens, state) {
  const token = tokens[state.index];

  if (!token) {
    throw new Error("Unexpected end of IDS token stream.");
  }

  state.index += 1;

  if (!supportedOperators.has(token)) {
    return {
      operator: null,
      leaves: [token]
    };
  }

  const arity = ternaryOperators.has(token) ? 3 : 2;
  const leaves = [];

  for (let childIndex = 0; childIndex < arity; childIndex += 1) {
    const child = parseNode(tokens, state);
    leaves.push(...child.leaves);
  }

  return {
    operator: token,
    leaves
  };
}

function flattenIds(ids) {
  const tokens = tokenizeIds(ids);
  const state = { index: 0 };
  const parsed = parseNode(tokens, state);

  if (state.index !== tokens.length) {
    throw new Error(`Unexpected trailing IDS tokens in ${ids}`);
  }

  return parsed.leaves;
}

export function normalizeChiseIds({ inputPath, sourceName }) {
  const raw = fs.readFileSync(inputPath, "utf8");
  const characters = [];

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const [codePoint, hanzi, ids] = trimmed.split("\t");

    if (!codePoint || !hanzi || !ids) {
      throw new Error(`Invalid CHISE IDS row: ${line}`);
    }

    characters.push({
      hanzi,
      structures: [
        {
          ids,
          parts: flattenIds(ids),
          sourceRef: codePoint,
          notes: `Normalized from ${path.basename(inputPath)}`
        }
      ]
    });
  }

  return {
    importType: "decomposition_structures",
    version: 1,
    sourceName,
    characters
  };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const inputPath = path.resolve(repoRoot, options.input);
  const outputPath = path.resolve(repoRoot, options.output);
  const normalized = normalizeChiseIds({
    inputPath,
    sourceName: options.sourceName
  });

  writeJsonFile(outputPath, normalized);
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  main();
}
