import type Database from "better-sqlite3";
import type { DashboardSummaryResponse } from "@hanzi-learning-app/shared";
import { listDecompositionWorkspace } from "../decomposition/decomposition-service.js";
import { getCurrentLevelProgress } from "../learning/level-progression-service.js";
import { listDueCharacterReviews, listDueWordReviews } from "../reviews/review-service.js";

export function getDashboardSummary(database: Database.Database): DashboardSummaryResponse {
  const learningProgress = getCurrentLevelProgress(database);
  const dueCharacters = listDueCharacterReviews(database);
  const dueWords = listDueWordReviews(database);
  const decompositionWorkspace = listDecompositionWorkspace(database);

  const characterCount = dueCharacters.items.length;
  const wordCount = dueWords.items.length;
  const totalCount = characterCount + wordCount;
  const charactersNeedingApprovalCount = decompositionWorkspace.charactersNeedingApproval.length;
  const unresolvedPropCount = decompositionWorkspace.unresolvedProps.length;

  return {
    dueReview: {
      characterCount,
      wordCount,
      totalCount
    },
    learningProgress,
    contentQueue: {
      hasWork: charactersNeedingApprovalCount > 0 || unresolvedPropCount > 0,
      charactersNeedingApprovalCount,
      unresolvedPropCount
    }
  };
}
