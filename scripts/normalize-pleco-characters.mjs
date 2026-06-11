import { createCliRunner } from "./lib/normalization-helpers.mjs";
import { normalizePlecoCharacters } from "./lib/normalize-pleco.mjs";

const runCli = createCliRunner(normalizePlecoCharacters, {
  sourceName: "pleco-characters-normalized"
});

runCli(process.argv.slice(2));
