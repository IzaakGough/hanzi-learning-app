import fs from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { parseNormalizedImport, type NormalizedImport } from "@hanzi-learning-app/shared";

function formatZodError(error: ZodError) {
  return error.issues
    .map((issue) => {
      const location = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${location}: ${issue.message}`;
    })
    .join("\n");
}

export function loadNormalizedImportFile(filePath: string): NormalizedImport {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error";
    throw new Error(`Invalid JSON in ${absolutePath}: ${message}`);
  }

  try {
    return parseNormalizedImport(parsedJson);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(`Invalid normalized import file ${absolutePath}:\n${formatZodError(error)}`);
    }

    throw error;
  }
}
