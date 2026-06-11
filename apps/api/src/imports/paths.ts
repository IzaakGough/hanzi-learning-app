import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);

export const repoRoot = path.resolve(
  currentDirPath,
  "..",
  "..",
  "..",
  "..",
);

export const exampleImportsDirectory = path.resolve(
  repoRoot,
  "data",
  "imports",
  "examples",
);
