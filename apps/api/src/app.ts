import express, { type Response } from "express";
import cors from "cors";
import type Database from "better-sqlite3";
import {
  HEALTHCHECK_PATH,
  parseMappingAdminInput,
  parsePropAdminInput,
  type HealthcheckResponse
} from "@hanzi-learning-app/shared";
import { databaseFilePath } from "./db/config.js";
import {
  createMapping,
  listMappings,
  MappingConflictError,
  MappingNotFoundError,
  updateMapping
} from "./services/admin/mappings-service.js";
import {
  createProp,
  listProps,
  PropConflictError,
  PropNotFoundError,
  updateProp
} from "./services/admin/props-service.js";

export function createApp(database: Database.Database) {
  const app = express();

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

  app.get("/mappings", (_request, response) => {
    response.json({ items: listMappings(database) });
  });

  app.post("/mappings", (request, response) => {
    try {
      const input = parseMappingAdminInput(request.body);
      const mapping = createMapping(database, input);
      response.status(201).json(mapping);
    } catch (error) {
      sendRouteError(response, error);
    }
  });

  app.put("/mappings/:id", (request, response) => {
    try {
      const input = parseMappingAdminInput(request.body);
      const mapping = updateMapping(database, request.params.id, input);
      response.json(mapping);
    } catch (error) {
      sendRouteError(response, error);
    }
  });

  app.get("/props", (request, response) => {
    const search = typeof request.query.search === "string" ? request.query.search : null;
    response.json({ items: listProps(database, search) });
  });

  app.post("/props", (request, response) => {
    try {
      const input = parsePropAdminInput(request.body);
      const prop = createProp(database, input);
      response.status(201).json(prop);
    } catch (error) {
      sendRouteError(response, error);
    }
  });

  app.put("/props/:id", (request, response) => {
    try {
      const input = parsePropAdminInput(request.body);
      const prop = updateProp(database, request.params.id, input);
      response.json(prop);
    } catch (error) {
      sendRouteError(response, error);
    }
  });

  return app;
}

function sendRouteError(
  response: Response,
  error: unknown
) {
  if (error instanceof MappingNotFoundError || error instanceof PropNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof MappingConflictError || error instanceof PropConflictError) {
    response.status(409).json({ error: error.message });
    return;
  }

  response.status(400).json({
    error: error instanceof Error ? error.message : "Unknown request error"
  });
}
