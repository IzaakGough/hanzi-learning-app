import type Database from "better-sqlite3";
import type { DashboardSummaryResponse } from "@hanzi-learning-app/shared";
import { getCurrentLevelProgress } from "../learning/level-progression-service.js";
import { getQueueCounts } from "../queue/queue-service.js";
import { listDueCharacterReviews, listDueWordReviews } from "../reviews/review-service.js";

export function getDashboardSummary(database: Database.Database): DashboardSummaryResponse {
  const learningProgress = getCurrentLevelProgress(database);
  const dueCharacters = listDueCharacterReviews(database);
  const dueWords = listDueWordReviews(database);
  const queueCounts = getQueueCounts(database);

  const characterCount = dueCharacters.items.length;
  const wordCount = dueWords.items.length;
  const totalCount = characterCount + wordCount;
  const queueTotalCount = queueCounts.reduce((sum, count) => sum + count.count, 0);

  return {
    dueReview: {
      characterCount,
      wordCount,
      totalCount
    },
    learningProgress,
    contentQueue: {
      hasWork: queueTotalCount > 0,
      totalCount: queueTotalCount,
      counts: queueCounts
    }
  };
}
