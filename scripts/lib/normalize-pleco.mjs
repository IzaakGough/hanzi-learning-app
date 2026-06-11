import { parseHeaderTable } from "./delimited-text.mjs";
import {
  optionalValue,
  readUtf8File,
  requireValue
} from "./normalization-helpers.mjs";

function parsePlecoRows(inputPath) {
  return parseHeaderTable(readUtf8File(inputPath), "\t");
}

export function normalizePlecoCharacters({ inputPath, sourceName, options }) {
  const rows = parsePlecoRows(inputPath);
  const sourceRef = options["source-ref"] ?? "Pleco Characters";

  return {
    importType: "known_characters",
    version: 1,
    sourceName,
    items: rows.map((row) => {
      const contextLabel = `Row ${row.__rowNumber}`;
      const item = {
        hanzi: requireValue(row, "hanzi", contextLabel),
        source: "pleco_import",
        sourceRef
      };

      const pinyinDisplay = optionalValue(row, "pinyin");
      if (pinyinDisplay) {
        item.pinyinDisplay = pinyinDisplay;
      }

      const meaningPrimary = optionalValue(row, "definition") ?? optionalValue(row, "meaning");
      if (meaningPrimary) {
        item.meaningPrimary = meaningPrimary;
      }

      const notes = optionalValue(row, "notes");
      if (notes) {
        item.notes = notes;
      }

      return item;
    })
  };
}

export function normalizePlecoWords({ inputPath, sourceName, options }) {
  const rows = parsePlecoRows(inputPath);
  const sourceRef = options["source-ref"] ?? "Pleco Words";

  return {
    importType: "known_words",
    version: 1,
    sourceName,
    items: rows.map((row) => {
      const contextLabel = `Row ${row.__rowNumber}`;
      const item = {
        simplified: requireValue(row, "word", contextLabel),
        source: "pleco_import",
        sourceRef
      };

      const pinyinDisplay = optionalValue(row, "pinyin");
      if (pinyinDisplay) {
        item.pinyinDisplay = pinyinDisplay;
      }

      const meaningPrimary = optionalValue(row, "definition") ?? optionalValue(row, "meaning");
      if (meaningPrimary) {
        item.meaningPrimary = meaningPrimary;
      }

      const notes = optionalValue(row, "notes");
      if (notes) {
        item.notes = notes;
      }

      return item;
    })
  };
}
