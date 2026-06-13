import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFilePath), "..");

const defaultInputDirectory = path.join(repoRoot, "data", "imports", "private", "raw", "chise-ids-upstream");
const defaultOutputPath = path.join(repoRoot, "data", "imports", "private", "raw", "chise-ids-ucs-abstract.txt");
const ucsAbstractFiles = [
  "IDS-UCS-Basic.txt",
  "IDS-UCS-Ext-A.txt",
  "IDS-UCS-Ext-B-1.txt",
  "IDS-UCS-Ext-B-2.txt",
  "IDS-UCS-Ext-B-3.txt",
  "IDS-UCS-Ext-B-4.txt",
  "IDS-UCS-Ext-B-5.txt",
  "IDS-UCS-Ext-B-6.txt",
  "IDS-UCS-Ext-C.txt",
  "IDS-UCS-Ext-D.txt",
  "IDS-UCS-Ext-E.txt",
  "IDS-UCS-Ext-F.txt",
  "IDS-UCS-Ext-G.txt",
  "IDS-UCS-Ext-H.txt",
  "IDS-UCS-Ext-I.txt",
  "IDS-UCS-Ext-J.txt"
];

function parseArguments(argv) {
  const options = {
    inputDir: defaultInputDirectory,
    output: defaultOutputPath
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === "--input-dir" && nextValue) {
      options.inputDir = path.resolve(repoRoot, nextValue);
      index += 1;
      continue;
    }

    if (argument === "--output" && nextValue) {
      options.output = path.resolve(repoRoot, nextValue);
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${argument}`);
  }

  return options;
}

function readRequiredFile(inputDirectory, fileName) {
  const filePath = path.join(inputDirectory, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Required CHISE IDS file not found: ${filePath}`);
  }

  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, "");
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const merged = ucsAbstractFiles
    .map((fileName) => readRequiredFile(options.inputDir, fileName).trimEnd())
    .join("\n");

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${merged}\n`, "utf8");

  console.log(JSON.stringify({
    inputDirectory: path.relative(repoRoot, options.inputDir),
    outputPath: path.relative(repoRoot, options.output),
    fileCount: ucsAbstractFiles.length
  }, null, 2));
}

main();
