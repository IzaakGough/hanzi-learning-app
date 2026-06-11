import fs from "node:fs";
import Database from "better-sqlite3";
import { databaseDirectory, databaseFilePath, sentenceAudioDirectory } from "./config.js";

export function createDatabaseConnection() {
  fs.mkdirSync(databaseDirectory, { recursive: true });
  fs.mkdirSync(sentenceAudioDirectory, { recursive: true });

  const database = new Database(databaseFilePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  return database;
}
