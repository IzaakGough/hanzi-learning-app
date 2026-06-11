import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  AudioStatus,
  ItemSource,
  SentenceApprovalStatus,
  SentenceGenerationJobStatus,
  type SentenceCreateInput,
  type SentenceGenerationJobRecord
} from "@hanzi-learning-app/shared";
import { buildGeneratedSentenceDraft, createSentence, SentenceNotFoundError } from "./sentence-service.js";

interface SentenceGenerationJobRow {
  id: string;
  word_id: string;
  status: SentenceGenerationJobStatus;
  error_message: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SentenceGenerationProvider {
  generateCandidate: (
    database: Database.Database,
    wordId: string
  ) => Pick<SentenceCreateInput, "text" | "translation" | "pinyinFull" | "linkedWords" | "analysisSpans">;
}

const activeDatabases = new WeakSet<Database.Database>();

function mapJobRecord(row: SentenceGenerationJobRow): SentenceGenerationJobRecord {
  return {
    id: row.id,
    wordId: row.word_id,
    status: row.status,
    errorMessage: row.error_message,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getWordSummary(database: Database.Database, wordId: string) {
  const row = database.prepare(`
    SELECT id
    FROM words
    WHERE id = ?
  `).get(wordId) as { id: string } | undefined;

  if (!row) {
    throw new SentenceNotFoundError(`Word ${wordId} was not found for sentence generation.`);
  }

  return row;
}

const defaultSentenceGenerationProvider: SentenceGenerationProvider = {
  generateCandidate(database, wordId) {
    getWordSummary(database, wordId);

    const variantIndex = (database.prepare(`
      SELECT COUNT(*) AS count
      FROM sentence_generation_jobs
      WHERE word_id = ?
        AND status = ?
    `).get(wordId, SentenceGenerationJobStatus.Completed) as { count: number }).count;

    return buildGeneratedSentenceDraft(database, [{ wordId, sortOrder: 0 }], variantIndex);
  }
};

function getNextPendingJob(database: Database.Database) {
  return database.prepare(`
    SELECT
      id,
      word_id,
      status,
      error_message,
      completed_at,
      created_at,
      updated_at
    FROM sentence_generation_jobs
    WHERE status = ?
    ORDER BY created_at ASC
    LIMIT 1
  `).get(SentenceGenerationJobStatus.Pending) as SentenceGenerationJobRow | undefined;
}

function markJobStatus(
  database: Database.Database,
  jobId: string,
  status: SentenceGenerationJobStatus,
  errorMessage: string | null = null
) {
  const now = new Date().toISOString();
  database.prepare(`
    UPDATE sentence_generation_jobs
    SET status = @status,
        error_message = @errorMessage,
        completed_at = @completedAt,
        updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id: jobId,
    status,
    errorMessage,
    completedAt: status === SentenceGenerationJobStatus.Completed ? now : null,
    updatedAt: now
  });
}

function processOnePendingJob(
  database: Database.Database,
  provider: SentenceGenerationProvider
) {
  const job = getNextPendingJob(database);
  if (!job) {
    return false;
  }

  markJobStatus(database, job.id, SentenceGenerationJobStatus.Processing);

  try {
    const draft = provider.generateCandidate(database, job.word_id);
    createSentence(database, {
      text: draft.text,
      translation: draft.translation,
      pinyinFull: draft.pinyinFull,
      approvalStatus: SentenceApprovalStatus.Pending,
      audioStatus: AudioStatus.None,
      audioPath: null,
      generationSource: ItemSource.Derived,
      notes: `Generated from sentence job ${job.id}`,
      linkedWords: draft.linkedWords,
      analysisSpans: draft.analysisSpans
    });
    markJobStatus(database, job.id, SentenceGenerationJobStatus.Completed);
  } catch (error) {
    markJobStatus(
      database,
      job.id,
      SentenceGenerationJobStatus.Failed,
      error instanceof Error ? error.message : "Unknown generation error"
    );
  }

  return true;
}

export function drainPendingSentenceGenerationJobs(
  database: Database.Database,
  provider: SentenceGenerationProvider = defaultSentenceGenerationProvider
) {
  while (processOnePendingJob(database, provider)) {
    continue;
  }
}

export function scheduleSentenceGenerationJobs(
  database: Database.Database,
  provider: SentenceGenerationProvider = defaultSentenceGenerationProvider
) {
  if (activeDatabases.has(database)) {
    return;
  }

  activeDatabases.add(database);
  setTimeout(() => {
    try {
      drainPendingSentenceGenerationJobs(database, provider);
    } finally {
      activeDatabases.delete(database);
      if (getNextPendingJob(database)) {
        scheduleSentenceGenerationJobs(database, provider);
      }
    }
  }, 0);
}

export function createSentenceGenerationJob(database: Database.Database, wordId: string) {
  getWordSummary(database, wordId);

  const now = new Date().toISOString();
  const id = randomUUID();
  database.prepare(`
    INSERT INTO sentence_generation_jobs (
      id,
      word_id,
      status,
      error_message,
      completed_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, NULL, NULL, ?, ?)
  `).run(id, wordId, SentenceGenerationJobStatus.Pending, now, now);

  scheduleSentenceGenerationJobs(database);

  const row = database.prepare(`
    SELECT
      id,
      word_id,
      status,
      error_message,
      completed_at,
      created_at,
      updated_at
    FROM sentence_generation_jobs
    WHERE id = ?
  `).get(id) as SentenceGenerationJobRow;

  return mapJobRecord(row);
}
