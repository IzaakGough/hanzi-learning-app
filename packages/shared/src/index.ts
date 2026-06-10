import { z } from "zod";

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

export const importSourceEnumSchema = z.enum([
  ItemSource.PlecoImport,
  ItemSource.CurriculumImport,
  ItemSource.Manual,
  ItemSource.Derived
]);

export const knownCharacterImportItemSchema = z.object({
  hanzi: z.string().min(1),
  pinyinDisplay: z.string().min(1).optional(),
  meaningPrimary: z.string().min(1).optional(),
  source: importSourceEnumSchema.default(ItemSource.PlecoImport),
  sourceRef: z.string().min(1).optional(),
  notes: z.string().optional()
});

export const knownCharactersImportSchema = z.object({
  importType: z.literal("known_characters"),
  version: z.literal(1),
  sourceName: z.string().min(1),
  items: z.array(knownCharacterImportItemSchema)
});

export const knownWordImportItemSchema = z.object({
  simplified: z.string().min(1),
  pinyinDisplay: z.string().min(1).optional(),
  meaningPrimary: z.string().min(1).optional(),
  source: importSourceEnumSchema.default(ItemSource.PlecoImport),
  sourceRef: z.string().min(1).optional(),
  notes: z.string().optional()
});

export const knownWordsImportSchema = z.object({
  importType: z.literal("known_words"),
  version: z.literal(1),
  sourceName: z.string().min(1),
  items: z.array(knownWordImportItemSchema)
});

export const levelCharacterImportSchema = z.object({
  hanzi: z.string().min(1)
});

export const levelWordImportSchema = z.object({
  simplified: z.string().min(1)
});

export const levelImportSchema = z.object({
  course: z.string().min(1),
  sequenceNumber: z.number().int().positive(),
  title: z.string().min(1).optional(),
  characters: z.array(levelCharacterImportSchema),
  words: z.array(levelWordImportSchema),
  notes: z.string().optional()
});

export const levelsImportSchema = z.object({
  importType: z.literal("levels"),
  version: z.literal(1),
  sourceName: z.string().min(1),
  items: z.array(levelImportSchema)
});

export const pinyinMappingImportItemSchema = z.object({
  kind: z.enum(["initial", "final", "tone"]),
  symbol: z.string().min(1),
  mappedValue: z.string().min(1),
  notes: z.string().optional()
});

export const pinyinMappingsImportSchema = z.object({
  importType: z.literal("pinyin_mappings"),
  version: z.literal(1),
  sourceName: z.string().min(1),
  items: z.array(pinyinMappingImportItemSchema)
});

export const normalizedImportSchema = z.discriminatedUnion("importType", [
  knownCharactersImportSchema,
  knownWordsImportSchema,
  levelsImportSchema,
  pinyinMappingsImportSchema
]);

export type KnownCharacterImportItem = z.infer<typeof knownCharacterImportItemSchema>;
export type KnownCharactersImport = z.infer<typeof knownCharactersImportSchema>;
export type KnownWordImportItem = z.infer<typeof knownWordImportItemSchema>;
export type KnownWordsImport = z.infer<typeof knownWordsImportSchema>;
export type LevelImport = z.infer<typeof levelImportSchema>;
export type LevelsImport = z.infer<typeof levelsImportSchema>;
export type PinyinMappingImportItem = z.infer<typeof pinyinMappingImportItemSchema>;
export type PinyinMappingsImport = z.infer<typeof pinyinMappingsImportSchema>;
export type NormalizedImport = z.infer<typeof normalizedImportSchema>;

export function parseKnownCharactersImport(input: unknown) {
  return knownCharactersImportSchema.parse(input);
}

export function parseKnownWordsImport(input: unknown) {
  return knownWordsImportSchema.parse(input);
}

export function parseLevelsImport(input: unknown) {
  return levelsImportSchema.parse(input);
}

export function parsePinyinMappingsImport(input: unknown) {
  return pinyinMappingsImportSchema.parse(input);
}

export function parseNormalizedImport(input: unknown) {
  return normalizedImportSchema.parse(input);
}
