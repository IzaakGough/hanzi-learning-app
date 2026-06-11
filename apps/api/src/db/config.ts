import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const apiRoot = path.resolve(currentDirPath, "..", "..");

const defaultDatabaseDirectory = path.join(apiRoot, "data");
const defaultDatabaseFilePath = path.join(defaultDatabaseDirectory, "hanzi-learning-app.sqlite");

export const databaseFilePath = process.env.HANZI_DB_PATH
  ? path.resolve(process.env.HANZI_DB_PATH)
  : defaultDatabaseFilePath;

export const databaseDirectory = path.dirname(databaseFilePath);
export const mediaDirectory = path.join(databaseDirectory, "media");
export const sentenceAudioDirectory = path.join(mediaDirectory, "audio", "sentences");
