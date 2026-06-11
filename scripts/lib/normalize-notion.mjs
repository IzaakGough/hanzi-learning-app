import { parseHeaderTable } from "./delimited-text.mjs";
import {
  optionalValue,
  readUtf8File,
  requireValue,
  splitListCell
} from "./normalization-helpers.mjs";

function parseNotionRows(inputPath) {
  return parseHeaderTable(readUtf8File(inputPath), ",");
}

export function normalizeNotionLevels({ inputPath, sourceName }) {
  const rows = parseNotionRows(inputPath);

  return {
    importType: "levels",
    version: 1,
    sourceName,
    items: rows.map((row) => {
      const contextLabel = `Row ${row.__rowNumber}`;
      const course = requireValue(row, "course", contextLabel);
      const sequenceNumberRaw = requireValue(row, "sequencenumber", contextLabel);
      const sequenceNumber = Number.parseInt(sequenceNumberRaw, 10);

      if (!Number.isInteger(sequenceNumber) || sequenceNumber <= 0) {
        throw new Error(`${contextLabel} has invalid sequence number "${sequenceNumberRaw}".`);
      }

      const charactersValue = optionalValue(row, "characters");
      const wordsValue = optionalValue(row, "words");

      return {
        course,
        sequenceNumber,
        title: optionalValue(row, "title"),
        characters: splitListCell(charactersValue ?? "").map((hanzi) => ({ hanzi })),
        words: splitListCell(wordsValue ?? "").map((simplified) => ({ simplified })),
        notes: optionalValue(row, "notes")
      };
    })
  };
}

export function normalizeNotionMappings({ inputPath, sourceName }) {
  const rows = parseNotionRows(inputPath);

  return {
    importType: "pinyin_mappings",
    version: 1,
    sourceName,
    items: rows.map((row) => {
      const contextLabel = `Row ${row.__rowNumber}`;
      const item = {
        kind: requireValue(row, "kind", contextLabel),
        symbol: requireValue(row, "symbol", contextLabel),
        mappedValue: requireValue(row, "mappedvalue", contextLabel)
      };

      const notes = optionalValue(row, "notes");
      if (notes) {
        item.notes = notes;
      }

      return item;
    })
  };
}
