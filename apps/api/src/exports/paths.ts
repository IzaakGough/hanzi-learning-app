import path from "node:path";
import { repoRoot } from "../imports/paths.js";

export const exportRootDirectory = process.env.HANZI_EXPORTS_DIR
  ? path.resolve(process.env.HANZI_EXPORTS_DIR)
  : path.join(repoRoot, "data", "exports");

export const backupExportDirectory = path.join(exportRootDirectory, "backups");
export const datasetExportDirectory = path.join(exportRootDirectory, "datasets");
