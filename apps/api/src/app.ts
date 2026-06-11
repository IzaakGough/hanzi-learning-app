import express, { type Response } from "express";
import cors from "cors";
import type Database from "better-sqlite3";
import {
  HEALTHCHECK_PATH,
  parseDecompositionCandidateCreateInput,
  parseDecompositionPartResolutionInput,
  parseLexicalEditInput,
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
import {
  InvalidLexicalEditError,
  updateCharacterLexical,
  updateWordLexical
} from "./services/search/lexical-edit-service.js";
import {
  getCharacterDetail,
  getWordDetail,
  searchItems,
  SearchEntityNotFoundError
} from "./services/search/search-service.js";
import {
  getCurrentLevelProgress,
  LearningItemNotFoundError,
  LearningItemNotReadyError,
  markCharacterLearned,
  markWordLearned
} from "./services/learning/level-progression-service.js";
import {
  approveDecompositionCandidate,
  createDecompositionCandidate,
  DecompositionApprovalBlockedError,
  DecompositionCandidateNotFoundError,
  DecompositionCharacterNotFoundError,
  DecompositionPartNotFoundError,
  listDecompositionWorkspace,
  resolveDecompositionPart
} from "./services/decomposition/decomposition-service.js";

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

  app.get("/search", (request, response) => {
    const query = typeof request.query.q === "string" ? request.query.q : "";
    response.json({ items: searchItems(database, query) });
  });

  app.get("/levels/current", (_request, response) => {
    response.json(getCurrentLevelProgress(database));
  });

  app.get("/decompositions/workspace", (_request, response) => {
    response.json(listDecompositionWorkspace(database));
  });

  app.post("/characters/:id/decomposition-candidates", (request, response) => {
    try {
      const input = parseDecompositionCandidateCreateInput(request.body);
      response.status(201).json(createDecompositionCandidate(database, request.params.id, input));
    } catch (error) {
      sendRouteError(response, error);
    }
  });

  app.post("/decompositions/parts/:id/resolve", (request, response) => {
    try {
      const input = parseDecompositionPartResolutionInput(request.body);
      response.json(resolveDecompositionPart(database, request.params.id, input));
    } catch (error) {
      sendRouteError(response, error);
    }
  });

  app.post("/decompositions/candidates/:id/approve", (request, response) => {
    try {
      response.json(approveDecompositionCandidate(database, request.params.id));
    } catch (error) {
      sendRouteError(response, error);
    }
  });

  app.post("/learning/characters/:id/learned", (request, response) => {
    try {
      response.json(markCharacterLearned(database, request.params.id));
    } catch (error) {
      sendRouteError(response, error);
    }
  });

  app.post("/learning/words/:id/learned", (request, response) => {
    try {
      response.json(markWordLearned(database, request.params.id));
    } catch (error) {
      sendRouteError(response, error);
    }
  });

  app.get("/characters/:id", (request, response) => {
    try {
      response.json(getCharacterDetail(database, request.params.id));
    } catch (error) {
      sendRouteError(response, error);
    }
  });

  app.put("/characters/:id/lexical", (request, response) => {
    try {
      const input = parseLexicalEditInput(request.body);
      response.json(updateCharacterLexical(database, request.params.id, input));
    } catch (error) {
      sendRouteError(response, error);
    }
  });

  app.get("/words/:id", (request, response) => {
    try {
      response.json(getWordDetail(database, request.params.id));
    } catch (error) {
      sendRouteError(response, error);
    }
  });

  app.put("/words/:id/lexical", (request, response) => {
    try {
      const input = parseLexicalEditInput(request.body);
      response.json(updateWordLexical(database, request.params.id, input));
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

  if (
    error instanceof DecompositionCharacterNotFoundError
    || error instanceof DecompositionCandidateNotFoundError
    || error instanceof DecompositionPartNotFoundError
  ) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof SearchEntityNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof LearningItemNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof MappingConflictError || error instanceof PropConflictError) {
    response.status(409).json({ error: error.message });
    return;
  }

  if (error instanceof LearningItemNotReadyError) {
    response.status(422).json({ error: error.message });
    return;
  }

  if (error instanceof InvalidLexicalEditError) {
    response.status(422).json({ error: error.message });
    return;
  }

  if (error instanceof DecompositionApprovalBlockedError) {
    response.status(422).json({ error: error.message });
    return;
  }

  response.status(400).json({
    error: error instanceof Error ? error.message : "Unknown request error"
  });
}
