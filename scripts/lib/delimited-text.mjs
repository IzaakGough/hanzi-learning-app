function finishRow(rows, row, value) {
  row.push(value);

  const hasContent = row.some((cell) => cell.length > 0);
  if (hasContent) {
    rows.push(row);
  }
}

export function parseDelimitedText(text, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === "\"") {
        if (text[index + 1] === "\"") {
          value += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += character;
      }

      continue;
    }

    if (character === "\"") {
      inQuotes = true;
      continue;
    }

    if (character === delimiter) {
      row.push(value);
      value = "";
      continue;
    }

    if (character === "\r") {
      if (text[index + 1] === "\n") {
        finishRow(rows, row, value);
        row = [];
        value = "";
        index += 1;
      } else {
        value += character;
      }

      continue;
    }

    if (character === "\n") {
      finishRow(rows, row, value);
      row = [];
      value = "";
      continue;
    }

    value += character;
  }

  if (inQuotes) {
    throw new Error("Unterminated quoted field.");
  }

  if (row.length > 0 || value.length > 0) {
    finishRow(rows, row, value);
  }

  return rows;
}

function normalizeHeader(header) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function parseHeaderTable(text, delimiter) {
  const rows = parseDelimitedText(text, delimiter);

  if (rows.length === 0) {
    throw new Error("File is empty.");
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) => normalizeHeader(header));

  if (headers.some((header) => header.length === 0)) {
    throw new Error("Header row contains an empty column name.");
  }

  return dataRows
    .map((cells, rowIndex) => {
      const record = {
        __rowNumber: rowIndex + 2
      };

      headers.forEach((header, headerIndex) => {
        record[header] = (cells[headerIndex] ?? "").trim();
      });

      return record;
    })
    .filter((record) =>
      Object.entries(record).some(([key, value]) => key !== "__rowNumber" && value.length > 0)
    );
}
