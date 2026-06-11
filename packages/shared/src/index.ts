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

export enum SchedulerType {
  Fsrs = "fsrs"
}

export enum ReviewGrade {
  Again = "again",
  Hard = "hard",
  Good = "good",
  Easy = "easy"
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
  pinyinSource: ItemSource | null;
  pinyinSourceRef: string | null;
  pinyinInitial: string | null;
  pinyinFinal: string | null;
  tone: string | null;
  meaningPrimary: string | null;
  meaningSource: ItemSource | null;
  meaningSourceRef: string | null;
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
  pinyinSource: ItemSource | null;
  pinyinSourceRef: string | null;
  meaningPrimary: string | null;
  meaningSource: ItemSource | null;
  meaningSourceRef: string | null;
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

export interface MappingAdminInput {
  kind: MappingKind;
  symbol: string;
  mappedValue: string;
  notes: string | null;
}

export interface PropAdminInput {
  name: string;
  type: PropType;
  shapeRef: string | null;
  meaningOrImage: string;
  notes: string | null;
  isActive: boolean;
}

export type SearchItemKind = "character" | "word";

export interface SearchResultItem {
  id: string;
  kind: SearchItemKind;
  text: string;
  pinyinDisplay: string | null;
  meaningPrimary: string | null;
  status: ItemStatus;
  source: ItemSource;
}

export interface CharacterLinkWord {
  id: string;
  simplified: string;
  pinyinDisplay: string | null;
  meaningPrimary: string | null;
  status: ItemStatus;
}

export interface WordComponentCharacter {
  id: string;
  hanzi: string;
  pinyinDisplay: string | null;
  meaningPrimary: string | null;
  status: ItemStatus;
}

export interface CharacterDetailRecord extends CharacterRecord {
  linkedWords: CharacterLinkWord[];
}

export interface WordDetailRecord extends WordRecord {
  componentCharacters: WordComponentCharacter[];
}

export type DecompositionPartResolutionKind = "prop" | "character" | "literal";

export interface DecompositionPartRecord {
  id: string;
  sortOrder: number;
  resolutionKind: DecompositionPartResolutionKind;
  text: string;
  propId: string | null;
  characterId: string | null;
}

export interface CharacterDecompositionRecord extends BaseEntity {
  characterId: string;
  status: "candidate" | "approved" | "rejected";
  source: ItemSource;
  sourceRef: string | null;
  notes: string | null;
  parts: DecompositionPartRecord[];
}

export interface DecompositionCharacterSummary {
  id: string;
  hanzi: string;
  pinyinDisplay: string | null;
  meaningPrimary: string | null;
  status: ItemStatus;
  blockedReason: string | null;
}

export interface DecompositionLinkedWordSummary {
  id: string;
  simplified: string;
  pinyinDisplay: string | null;
  meaningPrimary: string | null;
  status: ItemStatus;
}

export interface DecompositionCharacterWorkspace {
  character: DecompositionCharacterSummary;
  approvedDecomposition: CharacterDecompositionRecord | null;
  candidates: CharacterDecompositionRecord[];
  linkedWords: DecompositionLinkedWordSummary[];
}

export interface UnresolvedPropOption {
  id: string;
  name: string;
  type: PropType;
  shapeRef: string | null;
  meaningOrImage: string;
  isActive: number;
}

export interface UnresolvedPropQueueDependency {
  id: string;
  text: string;
  kind: "character" | "word";
  status: ItemStatus;
}

export interface UnresolvedPropQueueItem {
  partId: string;
  candidateId: string;
  characterId: string;
  characterHanzi: string;
  literalText: string;
  existingPropOptions: UnresolvedPropOption[];
  blockedDependencies: UnresolvedPropQueueDependency[];
}

export interface DecompositionWorkspaceResponse {
  charactersNeedingApproval: DecompositionCharacterWorkspace[];
  unresolvedProps: UnresolvedPropQueueItem[];
}

export type LearningBlockReason =
  | "missing_text"
  | "missing_pinyin"
  | "missing_pinyin_split"
  | "missing_primary_meaning"
  | "missing_approved_decomposition"
  | "component_characters_unlearned";

export interface LearningCharacterState {
  id: string;
  hanzi: string;
  pinyinDisplay: string | null;
  pinyinInitial: string | null;
  pinyinFinal: string | null;
  tone: string | null;
  meaningPrimary: string | null;
  status: ItemStatus;
  learnedAt: string | null;
  isLearnable: boolean;
  blockedReasons: LearningBlockReason[];
  hasApprovedDecomposition: boolean;
}

export interface LearningWordComponentState {
  id: string;
  hanzi: string;
  status: ItemStatus;
}

export interface LearningWordState {
  id: string;
  simplified: string;
  pinyinDisplay: string | null;
  meaningPrimary: string | null;
  status: ItemStatus;
  learnedAt: string | null;
  isLearnable: boolean;
  blockedReasons: LearningBlockReason[];
  componentCharacters: LearningWordComponentState[];
}

export interface LearningLevelState {
  id: string;
  course: string;
  sequenceNumber: number;
  title: string | null;
  isComplete: boolean;
  nextCharacterId: string | null;
  characters: LearningCharacterState[];
  words: LearningWordState[];
}

export interface CurrentLevelProgressResponse {
  level: LearningLevelState | null;
  courseComplete: boolean;
  learnedCharacterCount: number;
  learnedWordCount: number;
  totalLevelCount: number;
}

export type ReviewItemKind = "character" | "word";

export interface ReviewStateRecord extends BaseEntity {
  schedulerType: SchedulerType;
  dueAt: string;
  stability: number | null;
  difficulty: number | null;
  lastReviewedAt: string | null;
  reviewCount: number;
  lapseCount: number;
}

export interface CharacterReviewStateRecord extends ReviewStateRecord {
  characterId: string;
}

export interface WordReviewStateRecord extends ReviewStateRecord {
  wordId: string;
}

export interface ReviewEventRecord extends BaseEntity {
  itemKind: ReviewItemKind;
  itemId: string;
  schedulerType: SchedulerType;
  grade: ReviewGrade;
  reviewedAt: string;
  dueAtBefore: string | null;
  dueAtAfter: string;
  stabilityBefore: number | null;
  stabilityAfter: number | null;
  difficultyBefore: number | null;
  difficultyAfter: number | null;
  elapsedDays: number;
  reviewCountAfter: number;
  lapseCountAfter: number;
}

export interface DueCharacterReviewItem {
  id: string;
  hanzi: string;
  pinyinDisplay: string | null;
  meaningPrimary: string | null;
  learnedAt: string | null;
  reviewState: CharacterReviewStateRecord;
}

export interface DueWordReviewItem {
  id: string;
  simplified: string;
  pinyinDisplay: string | null;
  meaningPrimary: string | null;
  learnedAt: string | null;
  reviewState: WordReviewStateRecord;
}

export interface CharacterReviewQueueResponse {
  items: DueCharacterReviewItem[];
}

export interface WordReviewQueueResponse {
  items: DueWordReviewItem[];
}

export interface ReviewSubmissionResult {
  itemKind: ReviewItemKind;
  itemId: string;
  grade: ReviewGrade;
  reviewState: CharacterReviewStateRecord | WordReviewStateRecord;
  event: ReviewEventRecord;
}

export interface LexicalEditInput {
  pinyinDisplay: string | null;
  meaningPrimary: string | null;
  provenanceNote: string;
}

export interface DecompositionCandidateCreateInput {
  parts: string[];
  notes: string | null;
}

export type DecompositionPartResolutionInput =
  | {
      action: "match_existing_prop";
      propId: string;
    }
  | {
      action: "create_known_character_prop";
      name: string;
      shapeRef: string;
      meaningOrImage: string;
      notes: string | null;
    }
  | {
      action: "create_new_prop";
      name: string;
      shapeRef: string | null;
      meaningOrImage: string;
      notes: string | null;
    };

export interface ImportRecord extends BaseEntity {
  importType: string;
  sourceName: string;
  sourceRef: string | null;
  status: "started" | "completed" | "failed";
  summaryJson: string | null;
  errorMessage: string | null;
}

export type ImportType =
  | "known_characters"
  | "known_words"
  | "levels"
  | "pinyin_mappings";

export type ImportDiagnosticSeverity = "warning" | "error";
export type ImportDiagnosticEntityType =
  | "character"
  | "word"
  | "level"
  | "mapping"
  | "import";

export interface ImportDiagnostic {
  severity: ImportDiagnosticSeverity;
  code: string;
  message: string;
  entityType?: ImportDiagnosticEntityType;
  entityKey?: string;
  field?: string;
}

export interface ImportAppliedCounts {
  created: number;
  updated: number;
  linked: number;
  placeholdersCreated: number;
}

export interface ImportRunSummary {
  importId: string;
  importType: ImportType;
  sourceName: string;
  sourceRef: string | null;
  status: "completed" | "failed";
  diagnostics: ImportDiagnostic[];
  appliedCounts: ImportAppliedCounts;
}

function nullableTrimmedString(input: unknown) {
  if (typeof input !== "string") {
    return input;
  }

  const value = input.trim();
  return value.length === 0 ? null : value;
}

function uniqueBy<T>(
  items: T[],
  getKey: (item: T) => string,
  context: z.RefinementCtx,
  message: (key: string) => string,
) {
  const seen = new Set<string>();

  items.forEach((item, index) => {
    const key = getKey(item);

    if (seen.has(key)) {
      context.addIssue({
        code: "custom",
        message: message(key),
        path: [index]
      });
      return;
    }

    seen.add(key);
  });
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
}).superRefine((value, context) => {
  uniqueBy(
    value.items,
    (item) => item.hanzi,
    context,
    (key) => `Duplicate known character entry: ${key}`,
  );
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
}).superRefine((value, context) => {
  uniqueBy(
    value.items,
    (item) => item.simplified,
    context,
    (key) => `Duplicate known word entry: ${key}`,
  );
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
}).superRefine((value, context) => {
  uniqueBy(
    value.characters,
    (item) => item.hanzi,
    context,
    (key) => `Duplicate level character entry: ${key}`,
  );

  uniqueBy(
    value.words,
    (item) => item.simplified,
    context,
    (key) => `Duplicate level word entry: ${key}`,
  );
});

export const levelsImportSchema = z.object({
  importType: z.literal("levels"),
  version: z.literal(1),
  sourceName: z.string().min(1),
  items: z.array(levelImportSchema)
}).superRefine((value, context) => {
  uniqueBy(
    value.items,
    (item) => `${item.course}::${item.sequenceNumber}`,
    context,
    (key) => `Duplicate level entry: ${key}`,
  );
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
}).superRefine((value, context) => {
  uniqueBy(
    value.items,
    (item) => `${item.kind}::${item.symbol}`,
    context,
    (key) => `Duplicate pinyin mapping entry: ${key}`,
  );
});

export const normalizedImportSchema = z.discriminatedUnion("importType", [
  knownCharactersImportSchema,
  knownWordsImportSchema,
  levelsImportSchema,
  pinyinMappingsImportSchema
]);

export const mappingKindSchema = z.enum(["initial", "final", "tone"]);
export const propTypeSchema = z.enum(["component", "known_character"]);

export const mappingAdminInputSchema = z.object({
  kind: mappingKindSchema,
  symbol: z.string().trim().min(1),
  mappedValue: z.string().trim().min(1),
  notes: z.preprocess(
    nullableTrimmedString,
    z.string().min(1).nullable()
  )
});

export const propAdminInputSchema = z.object({
  name: z.string().trim().min(1),
  type: propTypeSchema,
  shapeRef: z.preprocess(
    nullableTrimmedString,
    z.string().min(1).nullable()
  ),
  meaningOrImage: z.string().trim().min(1),
  notes: z.preprocess(
    nullableTrimmedString,
    z.string().min(1).nullable()
  ),
  isActive: z.boolean()
});

export const lexicalEditInputSchema = z.object({
  pinyinDisplay: z.preprocess(
    nullableTrimmedString,
    z.string().min(1).nullable()
  ),
  meaningPrimary: z.preprocess(
    nullableTrimmedString,
    z.string().min(1).nullable()
  ),
  provenanceNote: z.string().trim().min(1)
});

export const decompositionCandidateCreateInputSchema = z.object({
  parts: z.array(z.string().trim().min(1)).min(1),
  notes: z.preprocess(
    nullableTrimmedString,
    z.string().min(1).nullable()
  )
});

export const decompositionPartResolutionInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("match_existing_prop"),
    propId: z.string().trim().min(1)
  }),
  z.object({
    action: z.literal("create_known_character_prop"),
    name: z.string().trim().min(1),
    shapeRef: z.string().trim().min(1),
    meaningOrImage: z.string().trim().min(1),
    notes: z.preprocess(
      nullableTrimmedString,
      z.string().min(1).nullable()
    )
  }),
  z.object({
    action: z.literal("create_new_prop"),
    name: z.string().trim().min(1),
    shapeRef: z.preprocess(
      nullableTrimmedString,
      z.string().min(1).nullable()
    ),
    meaningOrImage: z.string().trim().min(1),
    notes: z.preprocess(
      nullableTrimmedString,
      z.string().min(1).nullable()
    )
  })
]);

export const reviewGradeSchema = z.enum([
  ReviewGrade.Again,
  ReviewGrade.Hard,
  ReviewGrade.Good,
  ReviewGrade.Easy
]);

export const reviewGradeInputSchema = z.object({
  grade: reviewGradeSchema
});

export type KnownCharacterImportItem = z.infer<typeof knownCharacterImportItemSchema>;
export type KnownCharactersImport = z.infer<typeof knownCharactersImportSchema>;
export type KnownWordImportItem = z.infer<typeof knownWordImportItemSchema>;
export type KnownWordsImport = z.infer<typeof knownWordsImportSchema>;
export type LevelImport = z.infer<typeof levelImportSchema>;
export type LevelsImport = z.infer<typeof levelsImportSchema>;
export type PinyinMappingImportItem = z.infer<typeof pinyinMappingImportItemSchema>;
export type PinyinMappingsImport = z.infer<typeof pinyinMappingsImportSchema>;
export type NormalizedImport = z.infer<typeof normalizedImportSchema>;
export type MappingAdminInputPayload = z.infer<typeof mappingAdminInputSchema>;
export type PropAdminInputPayload = z.infer<typeof propAdminInputSchema>;
export type LexicalEditInputPayload = z.infer<typeof lexicalEditInputSchema>;
export type DecompositionCandidateCreateInputPayload = z.infer<typeof decompositionCandidateCreateInputSchema>;
export type DecompositionPartResolutionInputPayload = z.infer<typeof decompositionPartResolutionInputSchema>;
export type ReviewGradeInputPayload = z.infer<typeof reviewGradeInputSchema>;

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

export function parseMappingAdminInput(input: unknown) {
  return mappingAdminInputSchema.parse(input);
}

export function parsePropAdminInput(input: unknown) {
  return propAdminInputSchema.parse(input);
}

export function parseLexicalEditInput(input: unknown) {
  return lexicalEditInputSchema.parse(input);
}

export function parseDecompositionCandidateCreateInput(input: unknown) {
  return decompositionCandidateCreateInputSchema.parse(input);
}

export function parseDecompositionPartResolutionInput(input: unknown) {
  return decompositionPartResolutionInputSchema.parse(input);
}

export function parseReviewGradeInput(input: unknown) {
  return reviewGradeInputSchema.parse(input);
}
