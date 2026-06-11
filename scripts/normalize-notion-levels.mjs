import { createCliRunner } from "./lib/normalization-helpers.mjs";
import { normalizeNotionLevels } from "./lib/normalize-notion.mjs";

const runCli = createCliRunner(normalizeNotionLevels, {
  sourceName: "notion-levels-normalized"
});

runCli(process.argv.slice(2));
