import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  QueueItemType,
  type LearningBlockReason,
  type QueueActionInputPayload,
  type QueueAudioFailureItem,
  type QueueDecompositionCandidateItem,
  type QueueItemBase,
  type QueueItemState,
  type QueueListItem,
  type QueueListResponse,
  type QueueMissingLexicalDataItem,
  type QueueSentenceCandidateItem,
  type QueueTypeCount,
  type QueueUnresolvedPropItem
} from "@hanzi-learning-app/shared";
import {
  queueSentenceAudioGeneration
} from "../audio/audio-generation-service.js";
import {
  approveDecompositionCandidate,
  listDecompositionWorkspace,
  resolveDecompositionPart
} from "../decomposition/decomposition-service.js";
import { syncLearningStatuses } from "../learning/level-progression-service.js";
import { createSentenceGenerationJob } from "../sentences/sentence-generation-service.js";
import {
  approveSentenceCandidate,
  editAndApproveSentenceCandidate,
  getSentenceDetail,
  rejectSentenceCandidate
} from "../sentences/sentence-service.js";

interface QueueItemRow {
  id: string;
  dedupe_key: string;
  type: QueueItemType;
  state: QueueItemState;
  title: string;
  description: string | null;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

interface SentenceQueueRow {
  id: string;
  text: string;
  translation: string | null;
}

interface MissingLexicalRow {
  id: string;
  text: string;
  kind: "character" | "word";
  blocked_reason: LearningBlockReason;
  pinyin_display: string | null;
  pinyin_initial: string | null;
  pinyin_final?: string | null;
  tone?: string | null;
  meaning_primary: string | null;
}

interface PendingQueueDefinition {
  dedupeKey: string;
  type: QueueItemType;
  title: string;
  description: string | null;
  payload: Omit<QueueListItem, keyof QueueItemBase>;
}

export class QueueItemNotFoundError extends Error {
  constructor(id: string) {
    super(`Queue item ${id} was not found.`);
    this.name = "QueueItemNotFoundError";
  }
}

export class QueueActionNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueActionNotSupportedError";
  }
}

const queueTypeOrder: QueueItemType[] = [
  QueueItemType.DecompositionCandidate,
  QueueItemType.UnresolvedProp,
  QueueItemType.SentenceCandidate,
  QueueItemType.AudioFailure,
  QueueItemType.MissingLexicalData
];

function listSentenceCandidates(database: Database.Database) {
  const rows = database.prepare(`
    SELECT id, text, translation
    FROM sentences
    WHERE approval_status = 'pending'
    ORDER BY created_at ASC
  `).all() as SentenceQueueRow[];

  return rows.map((row) => {
    const sentence = getSentenceDetail(database, row.id);

    return {
      dedupeKey: `sentence_candidate:${row.id}`,
      type: QueueItemType.SentenceCandidate,
      title: row.text,
      description: row.translation,
      payload: {
        sentence
      }
    } satisfies PendingQueueDefinition;
  });
}

function listAudioFailures(database: Database.Database) {
  const rows = database.prepare(`
    SELECT id, text, translation
    FROM sentences
    WHERE audio_status = 'failed'
    ORDER BY updated_at ASC
  `).all() as SentenceQueueRow[];

  return rows.map((row) => {
    const sentence = getSentenceDetail(database, row.id);

    return {
      dedupeKey: `audio_failure:${row.id}`,
      type: QueueItemType.AudioFailure,
      title: row.text,
      description: row.translation,
      payload: {
        sentence
      }
    } satisfies PendingQueueDefinition;
  });
}

function getMissingFields(row: MissingLexicalRow) {
  const fields: string[] = [];

  if (!row.pinyin_display) {
    fields.push("pinyin");
  }

  if (row.kind === "character" && (!row.pinyin_initial || !row.pinyin_final || !row.tone)) {
    fields.push("pinyin split");
  }

  if (!row.meaning_primary) {
    fields.push("primary meaning");
  }

  return fields;
}

function listMissingLexicalData(database: Database.Database) {
  const characterRows = database.prepare(`
    SELECT
      id,
      hanzi AS text,
      'character' AS kind,
      blocked_reason,
      pinyin_display,
      pinyin_initial,
      pinyin_final,
      tone,
      meaning_primary
    FROM characters
    WHERE archived_at IS NULL
      AND blocked_reason IN ('missing_pinyin', 'missing_pinyin_split', 'missing_primary_meaning')
  `).all() as MissingLexicalRow[];

  const wordRows = database.prepare(`
    SELECT
      id,
      simplified AS text,
      'word' AS kind,
      blocked_reason,
      pinyin_display,
      NULL AS pinyin_initial,
      NULL AS pinyin_final,
      NULL AS tone,
      meaning_primary
    FROM words
    WHERE archived_at IS NULL
      AND blocked_reason IN ('missing_pinyin', 'missing_primary_meaning')
  `).all() as MissingLexicalRow[];

  return [...characterRows, ...wordRows]
    .sort((left, right) => left.text.localeCompare(right.text, "en-GB"))
    .map((row) => ({
      dedupeKey: `missing_lexical_data:${row.kind}:${row.id}`,
      type: QueueItemType.MissingLexicalData,
      title: row.text,
      description: `Missing ${getMissingFields(row).join(", ")}`,
      payload: {
        target: {
          id: row.id,
          text: row.text,
          kind: row.kind
        },
        blockedReason: row.blocked_reason,
        missingFields: getMissingFields(row)
      }
    } satisfies PendingQueueDefinition));
}

function buildPendingDefinitions(database: Database.Database): PendingQueueDefinition[] {
  syncLearningStatuses(database);
  const decompositionWorkspace = listDecompositionWorkspace(database);

  const decompositionCandidates = decompositionWorkspace.charactersNeedingApproval.flatMap((workspace) =>
    workspace.candidates.map((candidate) => ({
      dedupeKey: `decomposition_candidate:${candidate.id}`,
      type: QueueItemType.DecompositionCandidate,
      title: `${workspace.character.hanzi} decomposition candidate`,
      description: candidate.parts.map((part) => part.text).join(" + "),
      payload: {
        character: workspace.character,
        candidate,
        linkedWords: workspace.linkedWords
      }
    } satisfies PendingQueueDefinition))
  );

  const unresolvedProps = decompositionWorkspace.unresolvedProps.map((part) => ({
    dedupeKey: `unresolved_prop:${part.partId}`,
    type: QueueItemType.UnresolvedProp,
    title: `${part.characterHanzi} unresolved prop`,
    description: `Resolve ${part.literalText} before approval`,
    payload: {
      part
    }
  } satisfies PendingQueueDefinition));

  return [
    ...decompositionCandidates,
    ...unresolvedProps,
    ...listSentenceCandidates(database),
    ...listAudioFailures(database),
    ...listMissingLexicalData(database)
  ];
}

function loadQueueItemRows(database: Database.Database, state: QueueItemState = "open") {
  return database.prepare(`
    SELECT
      id,
      dedupe_key,
      type,
      state,
      title,
      description,
      payload_json,
      created_at,
      updated_at
    FROM queue_items
    WHERE state = ?
    ORDER BY
      CASE type
        WHEN 'decomposition_candidate' THEN 0
        WHEN 'unresolved_prop' THEN 1
        WHEN 'sentence_candidate' THEN 2
        WHEN 'audio_failure' THEN 3
        ELSE 4
      END,
      created_at ASC,
      title COLLATE NOCASE ASC
  `).all(state) as QueueItemRow[];
}

function mapQueueItem(row: QueueItemRow): QueueListItem {
  const base = {
    id: row.id,
    dedupeKey: row.dedupe_key,
    state: row.state,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  switch (row.type) {
    case QueueItemType.DecompositionCandidate: {
      const payload = JSON.parse(row.payload_json) as Pick<
        QueueDecompositionCandidateItem,
        "character" | "candidate" | "linkedWords"
      >;

      return {
        ...base,
        type: QueueItemType.DecompositionCandidate,
        ...payload,
        availableActions: [
          {
            action: "approve_decomposition_candidate",
            label: "Approve candidate"
          }
        ]
      };
    }
    case QueueItemType.UnresolvedProp: {
      const payload = JSON.parse(row.payload_json) as Pick<QueueUnresolvedPropItem, "part">;

      return {
        ...base,
        type: QueueItemType.UnresolvedProp,
        ...payload,
        availableActions: [
          {
            action: "resolve_unresolved_prop",
            label: "Resolve prop"
          }
        ]
      };
    }
    case QueueItemType.SentenceCandidate: {
      const payload = JSON.parse(row.payload_json) as Pick<QueueSentenceCandidateItem, "sentence">;

      return {
        ...base,
        type: QueueItemType.SentenceCandidate,
        ...payload,
        availableActions: [
          {
            action: "approve_sentence_candidate",
            label: "Approve sentence"
          },
          {
            action: "reject_sentence_candidate",
            label: "Reject sentence"
          },
          {
            action: "edit_and_approve_sentence_candidate",
            label: "Edit then approve"
          },
          {
            action: "regenerate_sentence_candidate",
            label: "Regenerate candidate"
          }
        ]
      };
    }
    case QueueItemType.AudioFailure: {
      const payload = JSON.parse(row.payload_json) as Pick<QueueAudioFailureItem, "sentence">;

      return {
        ...base,
        type: QueueItemType.AudioFailure,
        ...payload,
        availableActions: [
          {
            action: "regenerate_audio",
            label: "Regenerate audio"
          }
        ]
      };
    }
    case QueueItemType.MissingLexicalData: {
      const payload = JSON.parse(row.payload_json) as Pick<
        QueueMissingLexicalDataItem,
        "target" | "blockedReason" | "missingFields"
      >;

      return {
        ...base,
        type: QueueItemType.MissingLexicalData,
        ...payload,
        availableActions: [
          {
            action: "edit_missing_lexical_data",
            label: "Edit lexical data"
          }
        ]
      };
    }
  }
}

export function syncQueueItems(database: Database.Database) {
  const definitions = buildPendingDefinitions(database);
  const now = new Date().toISOString();

  const upsert = database.prepare(`
    INSERT INTO queue_items (
      id,
      dedupe_key,
      type,
      state,
      title,
      description,
      payload_json,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @dedupeKey,
      @type,
      'open',
      @title,
      @description,
      @payloadJson,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(dedupe_key) DO UPDATE SET
      type = excluded.type,
      state = 'open',
      title = excluded.title,
      description = excluded.description,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `);
  const resolve = database.prepare(`
    UPDATE queue_items
    SET state = 'resolved', updated_at = @updatedAt
    WHERE dedupe_key = @dedupeKey
      AND state != 'resolved'
  `);
  const activeKeys = new Set(definitions.map((definition) => definition.dedupeKey));
  const existingRows = database.prepare(`
    SELECT dedupe_key
    FROM queue_items
    WHERE state = 'open'
  `).all() as Array<{ dedupe_key: string }>;

  const run = database.transaction(() => {
    definitions.forEach((definition) => {
      upsert.run({
        id: randomUUID(),
        dedupeKey: definition.dedupeKey,
        type: definition.type,
        title: definition.title,
        description: definition.description,
        payloadJson: JSON.stringify(definition.payload),
        createdAt: now,
        updatedAt: now
      });
    });

    existingRows.forEach((row) => {
      if (!activeKeys.has(row.dedupe_key)) {
        resolve.run({
          dedupeKey: row.dedupe_key,
          updatedAt: now
        });
      }
    });
  });

  run();
}

export function getQueueCounts(database: Database.Database): QueueTypeCount[] {
  syncQueueItems(database);

  const rows = database.prepare(`
    SELECT type, COUNT(*) AS count
    FROM queue_items
    WHERE state = 'open'
    GROUP BY type
  `).all() as Array<{ type: QueueItemType; count: number }>;
  const countsByType = new Map(rows.map((row) => [row.type, row.count]));

  return queueTypeOrder.map((type) => ({
    type,
    count: countsByType.get(type) ?? 0
  }));
}

export function listQueueItems(database: Database.Database): QueueListResponse {
  syncQueueItems(database);

  return {
    counts: getQueueCounts(database),
    items: loadQueueItemRows(database).map(mapQueueItem)
  };
}

function requireQueueRow(database: Database.Database, queueItemId: string) {
  const row = database.prepare(`
    SELECT
      id,
      dedupe_key,
      type,
      state,
      title,
      description,
      payload_json,
      created_at,
      updated_at
    FROM queue_items
    WHERE id = ?
  `).get(queueItemId) as QueueItemRow | undefined;

  if (!row) {
    throw new QueueItemNotFoundError(queueItemId);
  }

  return row;
}

export function applyQueueAction(
  database: Database.Database,
  queueItemId: string,
  input: QueueActionInputPayload
) {
  syncQueueItems(database);
  const row = requireQueueRow(database, queueItemId);
  const item = mapQueueItem(row);

  if (item.state !== "open") {
    throw new QueueActionNotSupportedError(`Queue item ${queueItemId} is already resolved.`);
  }

  if (item.type === QueueItemType.DecompositionCandidate) {
    if (input.action !== "approve_decomposition_candidate") {
      throw new QueueActionNotSupportedError("Decomposition candidate items only support approval.");
    }

    approveDecompositionCandidate(database, item.candidate.id);
  } else if (item.type === QueueItemType.UnresolvedProp) {
    if (input.action !== "resolve_unresolved_prop") {
      throw new QueueActionNotSupportedError("Unresolved prop items only support resolution.");
    }

    resolveDecompositionPart(database, item.part.partId, input.resolution);
  } else if (item.type === QueueItemType.SentenceCandidate) {
    if (input.action === "approve_sentence_candidate") {
      approveSentenceCandidate(database, item.sentence.id);
      queueSentenceAudioGeneration(database, item.sentence.id);
    } else if (input.action === "reject_sentence_candidate") {
      rejectSentenceCandidate(database, item.sentence.id);
    } else if (input.action === "edit_and_approve_sentence_candidate") {
      editAndApproveSentenceCandidate(database, item.sentence.id, {
        text: input.text,
        translation: input.translation,
        pinyinFull: input.pinyinFull
      });
      queueSentenceAudioGeneration(database, item.sentence.id);
    } else if (input.action === "regenerate_sentence_candidate") {
      rejectSentenceCandidate(database, item.sentence.id);
      const linkedWordId = item.sentence.linkedWords[0]?.id;

      if (!linkedWordId) {
        throw new QueueActionNotSupportedError("Sentence candidate is missing a linked word for regeneration.");
      }

      createSentenceGenerationJob(database, linkedWordId);
    } else {
      throw new QueueActionNotSupportedError("Sentence candidate items only support moderation actions.");
    }
  } else if (item.type === QueueItemType.AudioFailure) {
    if (input.action !== "regenerate_audio") {
      throw new QueueActionNotSupportedError("Audio failure items only support audio regeneration.");
    }

    queueSentenceAudioGeneration(database, item.sentence.id, { forceRegenerate: true });
  } else {
    throw new QueueActionNotSupportedError(`Queue actions for ${item.type} are not implemented yet.`);
  }

  return listQueueItems(database);
}

export function hasQueueWork(database: Database.Database) {
  return getQueueCounts(database).some((count) => count.count > 0);
}

export function getQueueTotalCount(database: Database.Database) {
  return getQueueCounts(database).reduce((total, count) => total + count.count, 0);
}
