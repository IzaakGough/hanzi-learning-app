import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const apiRoot = path.resolve(currentDirPath, "..", "..");

export const databaseDirectory = path.join(apiRoot, "data");
export const databaseFilePath = path.join(databaseDirectory, "hanzi-learning-app.sqlite");
