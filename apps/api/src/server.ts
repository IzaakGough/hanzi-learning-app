import cors from "cors";
import express from "express";
import { HEALTHCHECK_PATH, type HealthcheckResponse } from "@hanzi-learning-app/shared";
import { createDatabaseConnection } from "./db/connection.js";
import { databaseFilePath } from "./db/config.js";
import { runMigrations } from "./db/migrate.js";

const port = Number(process.env.PORT ?? 3001);
const app = express();
const database = createDatabaseConnection();

runMigrations(database);

app.use(cors());
app.use(express.json());

app.get(HEALTHCHECK_PATH, (_request, response) => {
  const payload: HealthcheckResponse = {
    status: "ok",
    service: "api",
    databasePath: databaseFilePath
  };

  response.json(payload);
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
