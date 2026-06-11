import { createCliRunner } from "./lib/normalization-helpers.mjs";
import { normalizePlecoWords } from "./lib/normalize-pleco.mjs";

const runCli = createCliRunner(normalizePlecoWords, {
  sourceName: "pleco-words-normalized"
});

runCli(process.argv.slice(2));
