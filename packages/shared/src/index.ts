export const HEALTHCHECK_PATH = "/health";

export interface HealthcheckResponse {
  status: "ok";
  service: "api";
  databasePath: string;
}

export enum ItemStatus {
  Blocked = "blocked",
  Ready = "ready",
  Learned = "learned",
  Archived = "archived"
}

export enum ItemSource {
  PlecoImport = "pleco_import",
  CurriculumImport = "curriculum_import",
  Manual = "manual",
  Derived = "derived"
}

export enum QueueItemType {
  DecompositionCandidate = "decomposition_candidate",
  UnresolvedProp = "unresolved_prop",
  SentenceCandidate = "sentence_candidate",
  AudioFailure = "audio_failure",
  MissingLexicalData = "missing_lexical_data"
}

export enum SentenceApprovalStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected"
}

export enum AudioStatus {
  None = "none",
  Pending = "pending",
  Ready = "ready",
  Failed = "failed"
}

export type MappingKind = "initial" | "final" | "tone";
export type PropType = "component" | "known_character";

export interface TimestampColumns {
  createdAt: string;
  updatedAt: string;
}

export interface BaseEntity extends TimestampColumns {
  id: string;
}

export interface CharacterRecord extends BaseEntity {
  hanzi: string;
  pinyinDisplay: string | null;
  pinyinInitial: string | null;
  pinyinFinal: string | null;
  tone: string | null;
  meaningPrimary: string | null;
  meaningsOtherJson: string | null;
  status: ItemStatus;
  blockedReason: string | null;
  learnedAt: string | null;
  archivedAt: string | null;
  source: ItemSource;
  sourceRef: string | null;
  levelId: string | null;
  notes: string | null;
}

export interface WordRecord extends BaseEntity {
  simplified: string;
  pinyinDisplay: string | null;
  meaningPrimary: string | null;
  meaningsOtherJson: string | null;
  status: ItemStatus;
  blockedReason: string | null;
  learnedAt: string | null;
  archivedAt: string | null;
  source: ItemSource;
  sourceRef: string | null;
  levelId: string | null;
  notes: string | null;
}

export interface LevelRecord extends BaseEntity {
  course: string;
  sequenceNumber: number;
  title: string | null;
  notes: string | null;
}

export interface PropRecord extends BaseEntity {
  name: string;
  type: PropType;
  shapeRef: string | null;
  meaningOrImage: string;
  notes: string | null;
  isActive: number;
}

export interface PinyinMappingRecord extends BaseEntity {
  kind: MappingKind;
  symbol: string;
  mappedValue: string;
  notes: string | null;
}

export interface ImportRecord extends BaseEntity {
  importType: string;
  sourceName: string;
  sourceRef: string | null;
  status: "started" | "completed" | "failed";
  summaryJson: string | null;
  errorMessage: string | null;
}
