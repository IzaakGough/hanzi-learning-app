import { createCliRunner } from "./lib/normalization-helpers.mjs";
import { normalizeNotionMappings } from "./lib/normalize-notion.mjs";

const runCli = createCliRunner(normalizeNotionMappings, {
  sourceName: "notion-pinyin-mappings-normalized"
});

runCli(process.argv.slice(2));
