import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  AudioStatus,
  SentenceApprovalStatus,
  type SentenceDetailRecord
} from "@hanzi-learning-app/shared";
import { sentenceAudioDirectory } from "../../db/config.js";
import { getSentenceDetail, SentenceNotFoundError } from "../sentences/sentence-service.js";

type AudioGenerationJobStatus = "pending" | "processing" | "completed" | "failed";

interface AudioGenerationJobRow {
  id: string;
  sentence_id: string;
  status: AudioGenerationJobStatus;
  error_message: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SentenceAudioProvider {
  generateAudio(input: {
    sentence: SentenceDetailRecord;
    outputFilePath: string;
  }): Promise<void> | void;
}

interface QueueSentenceAudioOptions {
  forceRegenerate?: boolean;
  provider?: SentenceAudioProvider;
}

const activeDatabases = new WeakSet<Database.Database>();

function getSentenceAudioFilePath(sentenceId: string) {
  return path.join(sentenceAudioDirectory, `${sentenceId}.wav`);
}

function getSentenceAudioUrlPath(sentenceId: string) {
  return `/media/audio/sentences/${sentenceId}.wav`;
}

function writeSineWaveFile(
  outputFilePath: string,
  frequencies: number[],
  segmentDurationSeconds = 0.18
) {
  const sampleRate = 16_000;
  const amplitude = 0.3;
  const pauseSamples = Math.floor(sampleRate * 0.03);
  const toneSamples = Math.floor(sampleRate * segmentDurationSeconds);
  const segments = Math.max(1, frequencies.length);
  const totalSamples = segments * (toneSamples + pauseSamples);
  const pcm = Buffer.alloc(totalSamples * 2);
  let sampleIndex = 0;

  frequencies.forEach((frequency) => {
    for (let index = 0; index < toneSamples; index += 1) {
      const value = Math.sin((2 * Math.PI * frequency * index) / sampleRate);
      const sample = Math.round(value * amplitude * 32767);
      pcm.writeInt16LE(sample, sampleIndex * 2);
      sampleIndex += 1;
    }

    for (let index = 0; index < pauseSamples; index += 1) {
      pcm.writeInt16LE(0, sampleIndex * 2);
      sampleIndex += 1;
    }
  });

  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  const blockAlign = 2;
  const bitsPerSample = 16;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
  fs.writeFileSync(outputFilePath, Buffer.concat([header, pcm]));
}

function getSentenceFrequencies(text: string) {
  const characters = [...text.trim()].filter((character) => !/\s/u.test(character));
  const source = characters.length > 0 ? characters : ["-"];

  return source.map((character, index) => {
    const codePoint = character.codePointAt(0) ?? 45;
    return 320 + (codePoint % 12) * 30 + (index % 3) * 20;
  });
}

const defaultSentenceAudioProvider: SentenceAudioProvider = {
  generateAudio({ sentence, outputFilePath }) {
    writeSineWaveFile(outputFilePath, getSentenceFrequencies(sentence.text));
  }
};

function updateSentenceAudioState(
  database: Database.Database,
  sentenceId: string,
  audioStatus: AudioStatus,
  audioPath: string | null
) {
  database.prepare(`
    UPDATE sentences
    SET audio_status = @audioStatus,
        audio_path = @audioPath,
        updated_at = @updatedAt
    WHERE id = @sentenceId
  `).run({
    sentenceId,
    audioStatus,
    audioPath,
    updatedAt: new Date().toISOString()
  });
}

function getNextPendingJob(database: Database.Database) {
  return database.prepare(`
    SELECT
      id,
      sentence_id,
      status,
      error_message,
      completed_at,
      created_at,
      updated_at
    FROM audio_generation_jobs
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as AudioGenerationJobRow | undefined;
}

function hasOpenJob(database: Database.Database, sentenceId: string) {
  const row = database.prepare(`
    SELECT id
    FROM audio_generation_jobs
    WHERE sentence_id = ?
      AND status IN ('pending', 'processing')
    LIMIT 1
  `).get(sentenceId) as { id: string } | undefined;

  return row != null;
}

function markJobStatus(
  database: Database.Database,
  jobId: string,
  status: AudioGenerationJobStatus,
  errorMessage: string | null = null
) {
  const now = new Date().toISOString();
  database.prepare(`
    UPDATE audio_generation_jobs
    SET status = @status,
        error_message = @errorMessage,
        completed_at = @completedAt,
        updated_at = @updatedAt
    WHERE id = @id
  `).run({
    id: jobId,
    status,
    errorMessage,
    completedAt: status === "completed" ? now : null,
    updatedAt: now
  });
}

async function processOnePendingJob(
  database: Database.Database,
  provider: SentenceAudioProvider
) {
  const job = getNextPendingJob(database);
  if (!job) {
    return false;
  }

  markJobStatus(database, job.id, "processing");

  try {
    const sentence = getSentenceDetail(database, job.sentence_id);
    if (sentence.approvalStatus !== SentenceApprovalStatus.Approved) {
      throw new Error(`Sentence ${sentence.id} is not approved for audio generation.`);
    }

    const outputFilePath = getSentenceAudioFilePath(sentence.id);
    await provider.generateAudio({ sentence, outputFilePath });
    updateSentenceAudioState(
      database,
      sentence.id,
      AudioStatus.Ready,
      getSentenceAudioUrlPath(sentence.id)
    );
    markJobStatus(database, job.id, "completed");
  } catch (error) {
    updateSentenceAudioState(database, job.sentence_id, AudioStatus.Failed, null);
    markJobStatus(
      database,
      job.id,
      "failed",
      error instanceof Error ? error.message : "Unknown audio generation error"
    );
  }

  return true;
}

export function drainPendingAudioGenerationJobs(
  database: Database.Database,
  provider: SentenceAudioProvider = defaultSentenceAudioProvider
) {
  return (async () => {
    while (await processOnePendingJob(database, provider)) {
      continue;
    }
  })();
}

export function scheduleAudioGenerationJobs(
  database: Database.Database,
  provider: SentenceAudioProvider = defaultSentenceAudioProvider
) {
  if (activeDatabases.has(database)) {
    return;
  }

  activeDatabases.add(database);
  setTimeout(async () => {
    try {
      await drainPendingAudioGenerationJobs(database, provider);
    } finally {
      activeDatabases.delete(database);
      if (getNextPendingJob(database)) {
        scheduleAudioGenerationJobs(database, provider);
      }
    }
  }, 0);
}

export function queueSentenceAudioGeneration(
  database: Database.Database,
  sentenceId: string,
  options: QueueSentenceAudioOptions = {}
) {
  const sentence = getSentenceDetail(database, sentenceId);
  if (!sentence) {
    throw new SentenceNotFoundError(`Sentence ${sentenceId} was not found.`);
  }

  if (sentence.approvalStatus !== SentenceApprovalStatus.Approved) {
    throw new Error(`Sentence ${sentenceId} must be approved before audio generation.`);
  }

  if (!options.forceRegenerate) {
    if (sentence.audioStatus === AudioStatus.Ready && sentence.audioPath) {
      return sentence;
    }

    if (hasOpenJob(database, sentenceId)) {
      return getSentenceDetail(database, sentenceId);
    }
  }

  const now = new Date().toISOString();
  updateSentenceAudioState(database, sentenceId, AudioStatus.Pending, null);
  database.prepare(`
    INSERT INTO audio_generation_jobs (
      id,
      sentence_id,
      status,
      error_message,
      completed_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, 'pending', NULL, NULL, ?, ?)
  `).run(randomUUID(), sentenceId, now, now);

  scheduleAudioGenerationJobs(database, options.provider);

  return getSentenceDetail(database, sentenceId);
}
