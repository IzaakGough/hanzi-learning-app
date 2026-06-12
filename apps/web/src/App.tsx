import { useEffect, useState, type ReactNode } from "react";
import {
  getLearningBlockReasonMeta,
  HEALTHCHECK_PATH,
  ItemStatus,
  QueueItemType,
  ReviewGrade,
  type DecompositionCandidateCreateInputPayload,
  type PropAdminInput,
  type PropRecord,
  type PropType,
  type LearningBlockReason,
  type CharacterDetailRecord,
  type CharacterReviewQueueResponse,
  type CurrentLevelProgressResponse,
  type DashboardSummaryResponse,
  type DueCharacterReviewItem,
  type DueWordReviewItem,
  type HealthcheckResponse,
  type LearningCharacterState,
  type LearningLevelState,
  type LearningWordState,
  type QueueDecompositionCandidateItem,
  type QueueAudioFailureItem,
  type QueueListItem,
  type QueueListResponse,
  type QueueMissingLexicalDataItem,
  type QueueSentenceCandidateItem,
  type QueueTypeCount,
  type QueueUnresolvedPropItem,
  type ReviewSubmissionResult,
  type SentenceDisplayRecord,
  type WordDetailRecord,
  type WordReviewQueueResponse
} from "@hanzi-learning-app/shared";

const apiBaseUrl = "http://localhost:3001";

interface CharacterReviewSectionProps {
  item: DueCharacterReviewItem | null;
  detail: CharacterDetailRecord | null;
  dueCount: number;
  reviewedCount: number;
  totalCount: number;
  feedback: string | null;
  detailLoading: boolean;
  revealDisabled: boolean;
  gradeSubmitting: boolean;
  onReveal: () => void;
  onGrade: (grade: ReviewGrade) => void;
}

interface WordReviewSectionProps {
  item: DueWordReviewItem | null;
  detail: WordDetailRecord | null;
  dueCount: number;
  reviewedCount: number;
  totalCount: number;
  feedback: string | null;
  detailLoading: boolean;
  revealDisabled: boolean;
  gradeSubmitting: boolean;
  sentenceSubmitting: boolean;
  onReveal: () => void;
  onGrade: (grade: ReviewGrade) => void;
  onAddManualSentence: (values: ManualSentenceFormValues) => Promise<boolean>;
}

interface DashboardOverviewSectionProps {
  dashboard: DashboardSummaryResponse;
  onOpenReview: () => void;
  onOpenLearning: () => void;
  onOpenQueue: () => void;
  onOpenProps: () => void;
}

interface LearningSectionProps {
  progress: CurrentLevelProgressResponse;
  feedback: string | null;
  submittingItemId: string | null;
  decompositionSubmittingCharacterId: string | null;
  onMarkCharacterLearned: (character: LearningCharacterState) => void;
  onCreateDecompositionCandidate: (character: LearningCharacterState, values: DecompositionCandidateFormValues) => void;
  onMarkWordLearned: (word: LearningWordState) => void;
}

interface QueueHubSectionProps {
  queue: QueueListResponse;
  activeType: QueueItemType;
  feedback: string | null;
  actionItemId: string | null;
  onSelectType: (type: QueueItemType) => void;
  onApproveCandidate: (item: QueueDecompositionCandidateItem) => void;
  onResolveWithSuggestion: (item: QueueUnresolvedPropItem) => void;
  onCreateLiteralProp: (item: QueueUnresolvedPropItem) => void;
  onApproveSentence: (item: QueueSentenceCandidateItem) => void;
  onRejectSentence: (item: QueueSentenceCandidateItem) => void;
  onEditApproveSentence: (item: QueueSentenceCandidateItem, values: SentenceCandidateEditValues) => void;
  onEditMissingLexical: (item: QueueMissingLexicalDataItem, values: MissingLexicalEditValues) => void;
  onRegenerateSentence: (item: QueueSentenceCandidateItem) => void;
  onRegenerateAudio: (item: QueueAudioFailureItem) => void;
}

interface SentenceCandidateEditValues {
  text: string;
  translation: string;
  pinyinFull: string;
}

interface ManualSentenceFormValues {
  text: string;
  translation: string;
  pinyinFull: string;
}

interface MissingLexicalEditValues {
  pinyinDisplay: string;
  meaningPrimary: string;
  provenanceNote: string;
}

interface DecompositionCandidateFormValues {
  partsText: string;
  notes: string;
}

interface PropSectionProps {
  propsList: PropRecord[];
  loading: boolean;
  feedback: string | null;
  editingPropId: string | null;
  onSave: (input: PropAdminInput, propId: string | null) => void;
}

const reviewGrades = [
  ReviewGrade.Again,
  ReviewGrade.Hard,
  ReviewGrade.Good,
  ReviewGrade.Easy
] as const;

const propTypes: PropType[] = ["component", "known_character"];

const queueTypeLabels: Record<QueueItemType, string> = {
  [QueueItemType.DecompositionCandidate]: "Decomposition",
  [QueueItemType.UnresolvedProp]: "Unresolved Props",
  [QueueItemType.SentenceCandidate]: "Sentence Candidates",
  [QueueItemType.AudioFailure]: "Audio Failures",
  [QueueItemType.MissingLexicalData]: "Missing Lexical"
};

function formatNullable(value: string | null) {
  return value ?? "Not set";
}

function formatReviewCount(reviewedCount: number, totalCount: number) {
  return `${reviewedCount}/${totalCount} reviewed`;
}

function formatDueDate(isoTimestamp: string) {
  return new Date(isoTimestamp).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatGradeLabel(grade: ReviewGrade) {
  return grade[0].toUpperCase() + grade.slice(1);
}

function formatStatusLabel(status: ItemStatus) {
  return status[0].toUpperCase() + status.slice(1);
}

function formatBlockedReasonSummary(reason: LearningBlockReason) {
  const meta = getLearningBlockReasonMeta(reason);
  return `${meta.label}. ${meta.guidance}`;
}

function formatPropType(type: PropType) {
  return type === "known_character" ? "Known character" : "Component";
}

function getAudioUrl(audioPath: string | null) {
  if (!audioPath) {
    return null;
  }

  if (audioPath.startsWith("http://") || audioPath.startsWith("https://")) {
    return audioPath;
  }

  return `${apiBaseUrl}${audioPath}`;
}

function formatSentenceAudioStatus(sentence: SentenceDisplayRecord) {
  if (sentence.audioStatus === "ready" && sentence.audioPath) {
    return "Audio ready";
  }

  if (sentence.audioStatus === "pending") {
    return "Audio queued";
  }

  if (sentence.audioStatus === "failed") {
    return "Audio failed";
  }

  return "Audio unavailable";
}

function formatDecomposition(detail: CharacterDetailRecord | null) {
  if (!detail?.approvedDecomposition) {
    return "Not set";
  }

  return detail.approvedDecomposition.parts.map((part) => part.text).join(" + ");
}

function formatLinkedWords(detail: CharacterDetailRecord | null) {
  if (!detail || detail.linkedWords.length === 0) {
    return "None";
  }

  return detail.linkedWords.map((word) => word.simplified).join(", ");
}

function getNextCharacter(level: LearningLevelState | null) {
  if (!level) {
    return null;
  }

  return level.characters.find((character) => character.id === level.nextCharacterId) ?? null;
}

function getUnlockedWords(level: LearningLevelState | null) {
  if (!level) {
    return [];
  }

  return level.words.filter((word) => word.status === ItemStatus.Ready);
}

function getBlockedWords(level: LearningLevelState | null) {
  if (!level) {
    return [];
  }

  return level.words.filter((word) => word.status === ItemStatus.Blocked);
}

function scrollToSection(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function getVisibleQueueCounts(counts: QueueTypeCount[]) {
  return counts.filter((count) => count.count > 0);
}

function getDefaultQueueType(queue: QueueListResponse) {
  return getVisibleQueueCounts(queue.counts)[0]?.type ?? QueueItemType.DecompositionCandidate;
}

function QueueCountsList(props: { counts: QueueTypeCount[] }) {
  const visibleCounts = getVisibleQueueCounts(props.counts);

  if (visibleCounts.length === 0) {
    return <p className="item-note">No queue items are open right now.</p>;
  }

  return (
    <div className="summary-list">
      {visibleCounts.map((count) => (
        <div className="summary-row" key={count.type}>
          <span>{queueTypeLabels[count.type]}</span>
          <strong>{count.count}</strong>
        </div>
      ))}
    </div>
  );
}

function parseDecompositionParts(partsText: string) {
  return partsText
    .split(/[+,\s，]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function DecompositionCandidateComposer(props: {
  character: LearningCharacterState;
  isSubmitting: boolean;
  onSubmit: (values: DecompositionCandidateFormValues) => void;
}) {
  const [partsText, setPartsText] = useState("");
  const [notes, setNotes] = useState("");
  const parsedParts = parseDecompositionParts(partsText);

  function handleSubmit() {
    props.onSubmit({
      partsText,
      notes
    });
  }

  return (
    <div className="panel-stack">
      <div>
        <strong>Create decomposition candidate</strong>
        <p className="item-note">
          Enter parts separated by <code>+</code>, spaces, or commas. Literal parts will appear in the queue for prop resolution before approval.
        </p>
      </div>
      <label className="form-field">
        <span>Parts</span>
        <input
          onChange={(event) => setPartsText(event.target.value)}
          placeholder="⺍ + 冖 + 子"
          type="text"
          value={partsText}
        />
      </label>
      <label className="form-field">
        <span>Notes</span>
        <input
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional provenance or reasoning"
          type="text"
          value={notes}
        />
      </label>
      <p className="item-note">
        Preview: {parsedParts.length > 0 ? parsedParts.join(" + ") : "Add at least one part."}
      </p>
      <button
        className="primary-button"
        disabled={props.isSubmitting || parsedParts.length === 0}
        onClick={handleSubmit}
        type="button"
      >
        {props.isSubmitting ? `Saving ${props.character.hanzi}...` : `Create ${props.character.hanzi} candidate`}
      </button>
    </div>
  );
}

function LearningItemCard(props: {
  title: string;
  subtitle: string;
  status: ItemStatus;
  blockedReasons: LearningBlockReason[];
  actionLabel: string;
  actionDisabled: boolean;
  actionBusy: boolean;
  onAction: () => void;
  extraContent?: ReactNode;
}) {
  return (
    <article className="learning-item-card">
      <div className="learning-item-header">
        <div>
          <h3>{props.title}</h3>
          <p>{props.subtitle}</p>
        </div>
        <span className={`status-pill status-${props.status}`}>{formatStatusLabel(props.status)}</span>
      </div>

      {props.blockedReasons.length > 0 ? (
        <p className="item-note">Blocked: {props.blockedReasons.map(formatBlockedReasonSummary).join(" ")}</p>
      ) : null}

      {props.status === ItemStatus.Learned ? (
        <p className="item-note">Already learned and available for review scheduling.</p>
      ) : null}

      {props.extraContent}

      <button
        className="secondary-button"
        disabled={props.actionDisabled}
        onClick={props.onAction}
        type="button"
      >
        {props.actionBusy ? "Saving..." : props.actionLabel}
      </button>
    </article>
  );
}

function SentenceBank(props: { sentences: SentenceDisplayRecord[] }) {
  if (props.sentences.length === 0) {
    return <p className="item-note">No approved sentence bank entries yet.</p>;
  }

  return (
    <div className="learning-list">
      {props.sentences.map((sentence) => (
        <article className="queue-card" key={sentence.id}>
          <div className="queue-card-header">
            <div>
              <p className="section-kicker">Approved Sentence</p>
              <h3>{sentence.text}</h3>
            </div>
            <span className="summary-chip">{formatSentenceAudioStatus(sentence)}</span>
          </div>
          <p className="item-note">{formatNullable(sentence.translation)}</p>
          {sentence.audioStatus === "ready" && sentence.audioPath ? (
            <audio controls preload="none" src={getAudioUrl(sentence.audioPath) ?? undefined}>
              Your browser does not support audio playback.
            </audio>
          ) : (
            <p className="item-note">
              {sentence.audioStatus === "pending"
                ? "Audio is generating in the background."
                : "Sentence remains usable even without audio."}
            </p>
          )}
          <div className="queue-meta-grid">
            <div className="queue-span">
              <strong>Linked words</strong>
              <p>{sentence.linkedWords.map((word) => word.simplified).join(", ")}</p>
            </div>
            <div className="queue-span">
              <strong>Annotated spans</strong>
              <p>
                {sentence.displaySpans.map((span) => {
                  const annotation = [span.showPinyin ? span.pinyinText : null, span.showGloss ? span.glossText : null]
                    .filter((value): value is string => value != null)
                    .join(" - ");

                  return annotation.length > 0 ? `${span.text} (${annotation})` : span.text;
                }).join(" ")}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function DashboardOverviewSection(props: DashboardOverviewSectionProps) {
  const level = props.dashboard.learningProgress.level;
  const nextCharacter = getNextCharacter(level);
  const unlockedWords = getUnlockedWords(level);
  const blockedWords = getBlockedWords(level);

  return (
    <section className="workspace dashboard-grid">
      <article className="panel dashboard-priority-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Priority</p>
            <h2>Review first, queue work visible</h2>
          </div>
          <span className="priority-badge">{props.dashboard.dueReview.totalCount} total due</span>
        </div>

        <p className="hero-copy">
          The shared content queue now sits beside review and learning so blocked content work stays actionable.
        </p>

        <div className="dashboard-metric-row">
          <div className="metric-card metric-review">
            <strong>{props.dashboard.dueReview.characterCount}</strong>
            <span>Characters due</span>
          </div>
          <div className="metric-card metric-review">
            <strong>{props.dashboard.dueReview.wordCount}</strong>
            <span>Words due</span>
          </div>
          <div className="metric-card metric-review">
            <strong>{props.dashboard.contentQueue.totalCount}</strong>
            <span>Queue items</span>
          </div>
        </div>

        <div className="cta-row">
          <button className="primary-button" onClick={props.onOpenReview} type="button">
            Start Review
          </button>
          <button className="secondary-button" onClick={props.onOpenLearning} type="button">
            Continue Learning
          </button>
          <button className="secondary-button" onClick={props.onOpenQueue} type="button">
            Open Queue Hub
          </button>
          <button className="secondary-button" onClick={props.onOpenProps} type="button">
            Manage Props
          </button>
        </div>
      </article>

      <article className="panel dashboard-summary-panel">
        <p className="section-kicker">Current Level</p>
        {level ? (
          <>
            <h2>
              Level {level.sequenceNumber}
              {level.title ? ` - ${level.title}` : ""}
            </h2>
            <div className="summary-list">
              <div className="summary-row">
                <span>Next character</span>
                <strong>{nextCharacter ? `${nextCharacter.hanzi} - ${formatNullable(nextCharacter.pinyinDisplay)}` : "Level review"}</strong>
              </div>
              <div className="summary-row">
                <span>Unlocked words waiting</span>
                <strong>{unlockedWords.length}</strong>
              </div>
              <div className="summary-row">
                <span>Blocked words in level</span>
                <strong>{blockedWords.length}</strong>
              </div>
            </div>
          </>
        ) : (
          <>
            <h2>Course complete</h2>
            <p className="item-note">No current level remains. Review and queue work stay available.</p>
          </>
        )}
      </article>

      <article className="panel dashboard-summary-panel">
        <p className="section-kicker">Queue Work</p>
        <h2>Shared content queue counts</h2>
        <QueueCountsList counts={props.dashboard.contentQueue.counts} />
      </article>
    </section>
  );
}

export function LearningSection(props: LearningSectionProps) {
  const level = props.progress.level;
  const nextCharacter = getNextCharacter(level);
  const unlockedWords = getUnlockedWords(level);

  return (
    <section className="workspace" id="learning-section">
      <article className="panel panel-stack">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Learning</p>
            <h2>Current level progression</h2>
          </div>
          <div className="summary-chip-group">
            <span className="summary-chip">{props.progress.learnedCharacterCount} learned characters</span>
            <span className="summary-chip">{props.progress.learnedWordCount} learned words</span>
          </div>
        </div>

        {level ? (
          <>
            <section className="learning-highlight-grid">
              <article className="review-prompt-card">
                <p className="section-kicker">Next character to introduce</p>
                {nextCharacter ? (
                  <>
                    <div className="prompt-text">{nextCharacter.hanzi}</div>
                    <div className="meta-row">
                      <span>{formatNullable(nextCharacter.pinyinDisplay)}</span>
                      <span>{formatNullable(nextCharacter.meaningPrimary)}</span>
                    </div>
                  </>
                ) : (
                  <p className="item-note">Characters are complete for this level. Finish the remaining words.</p>
                )}
              </article>

              <article className="answer-card">
                <p className="section-kicker">Words ready now</p>
                {unlockedWords.length > 0 ? (
                  <ul className="compact-list">
                    {unlockedWords.map((word) => (
                      <li key={word.id}>
                        <span>{word.simplified}</span>
                        <span>{formatNullable(word.pinyinDisplay)}</span>
                        <span>{formatNullable(word.meaningPrimary)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="item-note">No level words are unlocked yet.</p>
                )}
              </article>
            </section>

            <section className="learning-columns">
              <div className="learning-column">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Characters</p>
                    <h3>Level {level.sequenceNumber} sequence</h3>
                  </div>
                </div>
                <div className="learning-list">
                  {level.characters.map((character) => (
                    <LearningItemCard
                      actionBusy={props.submittingItemId === character.id}
                      actionDisabled={character.status !== ItemStatus.Ready || props.submittingItemId !== null}
                      actionLabel="Mark Character Learned"
                      blockedReasons={character.blockedReasons}
                      extraContent={character.blockedReasons.includes("missing_approved_decomposition") ? (
                        <DecompositionCandidateComposer
                          character={character}
                          isSubmitting={props.decompositionSubmittingCharacterId === character.id}
                          onSubmit={(values) => props.onCreateDecompositionCandidate(character, values)}
                        />
                      ) : undefined}
                      key={character.id}
                      onAction={() => props.onMarkCharacterLearned(character)}
                      status={character.status}
                      subtitle={`${formatNullable(character.pinyinDisplay)} - ${formatNullable(character.meaningPrimary)}`}
                      title={character.hanzi}
                    />
                  ))}
                </div>
              </div>

              <div className="learning-column">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Words</p>
                    <h3>Unlocked and pending</h3>
                  </div>
                </div>
                <div className="learning-list">
                  {level.words.map((word) => (
                    <LearningItemCard
                      actionBusy={props.submittingItemId === word.id}
                      actionDisabled={word.status !== ItemStatus.Ready || props.submittingItemId !== null}
                      actionLabel="Mark Word Learned"
                      blockedReasons={word.blockedReasons}
                      key={word.id}
                      onAction={() => props.onMarkWordLearned(word)}
                      status={word.status}
                      subtitle={`${formatNullable(word.pinyinDisplay)} - ${formatNullable(word.meaningPrimary)}`}
                      title={word.simplified}
                    />
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : (
          <section className="empty-state">
            <strong>Course complete.</strong>
            <p>No current level remains. Continue with due review or queue work.</p>
          </section>
        )}

        <p className="form-message left">{props.feedback ?? " "}</p>
      </article>
    </section>
  );
}

export function PropsSection(props: PropSectionProps) {
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<PropType>("component");
  const [shapeRef, setShapeRef] = useState("");
  const [isActive, setIsActive] = useState(true);
  const selectedProp = props.propsList.find((prop) => prop.id === selectedPropId) ?? null;

  useEffect(() => {
    if (!selectedProp) {
      return;
    }

    setName(selectedProp.name);
    setType(selectedProp.type);
    setShapeRef(selectedProp.shapeRef ?? "");
    setIsActive(selectedProp.isActive === 1);
  }, [selectedProp]);

  function resetForm() {
    setSelectedPropId(null);
    setName("");
    setType("component");
    setShapeRef("");
    setIsActive(true);
  }

  function handleSelect(prop: PropRecord) {
    setSelectedPropId(prop.id);
  }

  function handleSubmit() {
    props.onSave(
      {
        name,
        type,
        shapeRef: shapeRef.trim().length > 0 ? shapeRef : null,
        meaningOrImage: null,
        notes: null,
        isActive
      },
      selectedPropId
    );
  }

  return (
    <section className="workspace" id="props-section">
      <article className="panel panel-stack">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Props</p>
            <h2>Manage mnemonic props</h2>
          </div>
          <div className="summary-chip-group">
            <span className="summary-chip">{props.propsList.length} loaded</span>
            <span className="summary-chip">{props.propsList.filter((prop) => prop.isActive === 1).length} active</span>
          </div>
        </div>

        <section className="learning-columns">
          <div className="learning-column">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Library</p>
                <h3>Existing props</h3>
              </div>
            </div>
            {props.loading ? (
              <p className="item-note">Loading props...</p>
            ) : props.propsList.length > 0 ? (
              <div className="props-library-list">
                {props.propsList.map((prop) => (
                  <article className="prop-card" key={prop.id}>
                    <div className="prop-card-header">
                      <div>
                        <h3>{prop.name}</h3>
                        <p>{prop.shapeRef ?? formatPropType(prop.type)}</p>
                      </div>
                      <span className={`status-pill status-${prop.isActive === 1 ? "ready" : "blocked"}`}>
                        {prop.isActive === 1 ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <dl className="prop-meta-list">
                      <div>
                        <dt>Type</dt>
                        <dd>{formatPropType(prop.type)}</dd>
                      </div>
                      <div>
                        <dt>Shape</dt>
                        <dd>{prop.shapeRef ?? "None"}</dd>
                      </div>
                      <div className="prop-meta-span">
                        <dt>Stored value</dt>
                        <dd>{prop.meaningOrImage}</dd>
                      </div>
                    </dl>
                    <div className="prop-card-actions">
                      <button className="secondary-button" onClick={() => handleSelect(prop)} type="button">
                        Edit Prop
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="item-note">No props yet.</p>
            )}
          </div>

          <div className="learning-column">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Editor</p>
                <h3>{selectedProp ? `Edit ${selectedProp.name}` : "Create a new prop"}</h3>
              </div>
            </div>
            <div className="prop-editor-card">
              <p className="item-note">
                Define the reusable prop label and optional shape reference used during decomposition approval.
              </p>
              <div className="prop-form-grid">
              <label className="form-field">
                <span>Name</span>
                <input onChange={(event) => setName(event.target.value)} placeholder="Roof cover" type="text" value={name} />
              </label>
              <label className="form-field">
                <span>Type</span>
                <select onChange={(event) => setType(event.target.value as PropType)} value={type}>
                  {propTypes.map((propType) => (
                    <option key={propType} value={propType}>
                      {formatPropType(propType)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Shape ref</span>
                <input onChange={(event) => setShapeRef(event.target.value)} placeholder="冖" type="text" value={shapeRef} />
              </label>
              </div>
              <label className="prop-toggle">
                <input checked={isActive} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" />
                <span>Keep this prop active for suggestions and decomposition work</span>
              </label>
              <div className="queue-actions-row">
                <button
                  className="primary-button"
                  disabled={props.editingPropId !== null || name.trim().length === 0}
                  onClick={handleSubmit}
                  type="button"
                >
                  {props.editingPropId !== null ? "Saving..." : selectedProp ? "Save Prop" : "Create Prop"}
                </button>
                <button className="secondary-button" disabled={props.editingPropId !== null} onClick={resetForm} type="button">
                  Clear
                </button>
              </div>
            </div>
          </div>
        </section>

        <p className="form-message left">{props.feedback ?? " "}</p>
      </article>
    </section>
  );
}

function QueueDecompositionCard(props: {
  item: QueueDecompositionCandidateItem;
  actionItemId: string | null;
  onApprove: () => void;
}) {
  return (
    <article className="queue-card">
      <div className="queue-card-header">
        <div>
          <p className="section-kicker">Decomposition Candidate</p>
          <h3>{props.item.character.hanzi}</h3>
        </div>
        <span className={`status-pill status-${props.item.character.status}`}>{formatStatusLabel(props.item.character.status)}</span>
      </div>
      <p className="item-note">{props.item.description}</p>
      <div className="queue-meta-grid">
        <div>
          <strong>Meaning</strong>
          <p>{formatNullable(props.item.character.meaningPrimary)}</p>
        </div>
        <div>
          <strong>Pinyin</strong>
          <p>{formatNullable(props.item.character.pinyinDisplay)}</p>
        </div>
        <div className="queue-span">
          <strong>Candidate parts</strong>
          <p>{props.item.candidate.parts.map((part) => part.text).join(" + ")}</p>
        </div>
        <div className="queue-span">
          <strong>Linked words</strong>
          <p>{props.item.linkedWords.length > 0 ? props.item.linkedWords.map((word) => word.simplified).join(", ") : "None"}</p>
        </div>
      </div>
      {props.item.candidate.notes ? <p className="item-note">Notes: {props.item.candidate.notes}</p> : null}
      <button
        className="primary-button"
        disabled={props.actionItemId === props.item.id}
        onClick={props.onApprove}
        type="button"
      >
        {props.actionItemId === props.item.id ? "Saving..." : "Approve Candidate"}
      </button>
    </article>
  );
}

function QueueUnresolvedPropCard(props: {
  item: QueueUnresolvedPropItem;
  actionItemId: string | null;
  onResolveWithSuggestion: () => void;
  onCreateLiteralProp: () => void;
}) {
  const suggestion = props.item.part.existingPropOptions[0] ?? null;

  return (
    <article className="queue-card">
      <div className="queue-card-header">
        <div>
          <p className="section-kicker">Unresolved Prop</p>
          <h3>{props.item.part.characterHanzi} needs {props.item.part.literalText}</h3>
        </div>
        <span className="summary-chip">{props.item.part.blockedDependencies.length} blocked dependents</span>
      </div>
      <p className="item-note">{props.item.description}</p>
      <div className="queue-meta-grid">
        <div>
          <strong>Suggested props</strong>
          <p>{suggestion ? `${suggestion.name} (${suggestion.meaningOrImage})` : "No existing prop suggestions"}</p>
        </div>
        <div className="queue-span">
          <strong>Blocked items</strong>
          <p>{props.item.part.blockedDependencies.map((dependency) => dependency.text).join(", ") || "None"}</p>
        </div>
      </div>
      <div className="queue-actions-row">
        <button
          className="secondary-button"
          disabled={!suggestion || props.actionItemId === props.item.id}
          onClick={props.onResolveWithSuggestion}
          type="button"
        >
          {props.actionItemId === props.item.id ? "Saving..." : suggestion ? `Match ${suggestion.name}` : "No match available"}
        </button>
        <button
          className="primary-button"
          disabled={props.actionItemId === props.item.id}
          onClick={props.onCreateLiteralProp}
          type="button"
        >
          {props.actionItemId === props.item.id ? "Saving..." : "Create Prop"}
        </button>
      </div>
    </article>
  );
}

function QueueMissingLexicalCard(props: {
  item: QueueMissingLexicalDataItem;
  actionItemId: string | null;
  onSave: (item: QueueMissingLexicalDataItem, values: MissingLexicalEditValues) => void;
}) {
  const [pinyinDisplay, setPinyinDisplay] = useState(props.item.currentPinyinDisplay ?? "");
  const [meaningPrimary, setMeaningPrimary] = useState(props.item.currentMeaningPrimary ?? "");
  const [provenanceNote, setProvenanceNote] = useState("Queue lexical cleanup");
  const isBusy = props.actionItemId === props.item.id;
  const blockedMeta = getLearningBlockReasonMeta(props.item.blockedReason);

  return (
    <article className="queue-card">
      <div className="queue-card-header">
        <div>
          <p className="section-kicker">Missing Lexical Data</p>
          <h3>{props.item.target.text}</h3>
        </div>
        <span className="summary-chip">{props.item.target.kind}</span>
      </div>
      <p className="item-note">Blocked: {blockedMeta.label}. {blockedMeta.guidance}</p>
      <p className="item-note">Missing {props.item.missingFields.join(", ")}. Save here to clear the queue item once the data is complete.</p>
      <label className="field-group">
        <span>Pinyin</span>
        <input
          onChange={(event) => setPinyinDisplay(event.target.value)}
          type="text"
          value={pinyinDisplay}
        />
      </label>
      <label className="field-group">
        <span>Primary meaning</span>
        <input
          onChange={(event) => setMeaningPrimary(event.target.value)}
          type="text"
          value={meaningPrimary}
        />
      </label>
      <label className="field-group">
        <span>Provenance note</span>
        <input
          onChange={(event) => setProvenanceNote(event.target.value)}
          type="text"
          value={provenanceNote}
        />
      </label>
      <button
        className="primary-button"
        disabled={isBusy || provenanceNote.trim().length === 0}
        onClick={() => props.onSave(props.item, { pinyinDisplay, meaningPrimary, provenanceNote })}
        type="button"
      >
        {isBusy ? "Saving..." : "Save Lexical Data"}
      </button>
    </article>
  );
}

function QueueSentenceCandidateCard(props: {
  item: QueueSentenceCandidateItem;
  actionItemId: string | null;
  onApprove: (item: QueueSentenceCandidateItem) => void;
  onReject: (item: QueueSentenceCandidateItem) => void;
  onEditApprove: (item: QueueSentenceCandidateItem, values: SentenceCandidateEditValues) => void;
  onRegenerate: (item: QueueSentenceCandidateItem) => void;
}) {
  const [draftText, setDraftText] = useState(props.item.sentence.text);
  const [draftTranslation, setDraftTranslation] = useState(props.item.sentence.translation ?? "");
  const [draftPinyin, setDraftPinyin] = useState(props.item.sentence.pinyinFull ?? "");
  const isBusy = props.actionItemId === props.item.id;

  return (
    <article className="queue-card">
      <div className="queue-card-header">
        <div>
          <p className="section-kicker">Sentence Candidate</p>
          <h3>{props.item.sentence.text}</h3>
        </div>
        <span className="summary-chip">{props.item.sentence.linkedWords.map((word) => word.simplified).join(", ")}</span>
      </div>
      <div className="queue-meta-grid">
        <div className="queue-span">
          <strong>Linked words</strong>
          <p>{props.item.sentence.linkedWords.map((word) => `${word.simplified} - ${formatNullable(word.meaningPrimary)}`).join(", ")}</p>
        </div>
      </div>
      <label className="field-group">
        <span>Sentence text</span>
        <textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} />
      </label>
      <label className="field-group">
        <span>Translation</span>
        <input value={draftTranslation} onChange={(event) => setDraftTranslation(event.target.value)} type="text" />
      </label>
      <label className="field-group">
        <span>Pinyin</span>
        <input value={draftPinyin} onChange={(event) => setDraftPinyin(event.target.value)} type="text" />
      </label>
      <div className="queue-actions-row">
        <button className="primary-button" disabled={isBusy} onClick={() => props.onApprove(props.item)} type="button">
          {isBusy ? "Saving..." : "Approve"}
        </button>
        <button className="secondary-button" disabled={isBusy} onClick={() => props.onReject(props.item)} type="button">
          {isBusy ? "Saving..." : "Reject"}
        </button>
        <button
          className="secondary-button"
          disabled={isBusy || draftText.trim().length === 0}
          onClick={() => props.onEditApprove(props.item, {
            text: draftText,
            translation: draftTranslation,
            pinyinFull: draftPinyin
          })}
          type="button"
        >
          {isBusy ? "Saving..." : "Edit + Approve"}
        </button>
        <button className="secondary-button" disabled={isBusy} onClick={() => props.onRegenerate(props.item)} type="button">
          {isBusy ? "Saving..." : "Regenerate"}
        </button>
      </div>
    </article>
  );
}

function QueueAudioFailureCard(props: {
  item: QueueAudioFailureItem;
  actionItemId: string | null;
  onRegenerate: (item: QueueAudioFailureItem) => void;
}) {
  const isBusy = props.actionItemId === props.item.id;

  return (
    <article className="queue-card">
      <div className="queue-card-header">
        <div>
          <p className="section-kicker">Audio Failure</p>
          <h3>{props.item.sentence.text}</h3>
        </div>
        <span className="summary-chip">{props.item.sentence.linkedWords.map((word) => word.simplified).join(", ")}</span>
      </div>
      <p className="item-note">{formatNullable(props.item.sentence.translation)}</p>
      <p className="item-note">Stored sentence content stays available while audio is retried.</p>
      <button
        className="secondary-button"
        disabled={isBusy}
        onClick={() => props.onRegenerate(props.item)}
        type="button"
      >
        {isBusy ? "Saving..." : "Regenerate Audio"}
      </button>
    </article>
  );
}

export function QueueHubSection(props: QueueHubSectionProps) {
  const filteredItems = props.queue.items.filter((item) => item.type === props.activeType);

  return (
    <section className="workspace" id="queue-section">
      <article className="panel panel-stack">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Queue Hub</p>
            <h2>Shared content moderation and cleanup</h2>
          </div>
          <div className="summary-chip-group">
            <span className="summary-chip">{props.queue.items.length} open items</span>
            <span className="summary-chip">{queueTypeLabels[props.activeType]}</span>
          </div>
        </div>

        <div className="queue-tab-row">
          {props.queue.counts.map((count) => (
            <button
              className={count.type === props.activeType ? "queue-tab queue-tab-active" : "queue-tab"}
              key={count.type}
              onClick={() => props.onSelectType(count.type)}
              type="button"
            >
              <span>{queueTypeLabels[count.type]}</span>
              <strong>{count.count}</strong>
            </button>
          ))}
        </div>

        {filteredItems.length > 0 ? (
          <div className="queue-list">
            {filteredItems.map((item) => {
              switch (item.type) {
                case QueueItemType.DecompositionCandidate:
                  return (
                    <QueueDecompositionCard
                      actionItemId={props.actionItemId}
                      item={item}
                      key={item.id}
                      onApprove={() => props.onApproveCandidate(item)}
                    />
                  );
                case QueueItemType.UnresolvedProp:
                  return (
                    <QueueUnresolvedPropCard
                      actionItemId={props.actionItemId}
                      item={item}
                      key={item.id}
                      onCreateLiteralProp={() => props.onCreateLiteralProp(item)}
                      onResolveWithSuggestion={() => props.onResolveWithSuggestion(item)}
                    />
                  );
                case QueueItemType.MissingLexicalData:
                  return (
                    <QueueMissingLexicalCard
                      actionItemId={props.actionItemId}
                      item={item}
                      key={item.id}
                      onSave={props.onEditMissingLexical}
                    />
                  );
                case QueueItemType.SentenceCandidate:
                  return (
                    <QueueSentenceCandidateCard
                      actionItemId={props.actionItemId}
                      item={item}
                      key={item.id}
                      onApprove={props.onApproveSentence}
                      onEditApprove={props.onEditApproveSentence}
                      onRegenerate={props.onRegenerateSentence}
                      onReject={props.onRejectSentence}
                    />
                  );
                case QueueItemType.AudioFailure:
                  return (
                    <QueueAudioFailureCard
                      actionItemId={props.actionItemId}
                      item={item}
                      key={item.id}
                      onRegenerate={props.onRegenerateAudio}
                    />
                  );
              }
            })}
          </div>
        ) : (
          <section className="empty-state">
            <strong>No {queueTypeLabels[props.activeType].toLowerCase()} items.</strong>
            <p>This queue type is empty right now, but the tab stays available for later ticket work.</p>
          </section>
        )}

        <p className="form-message left">{props.feedback ?? " "}</p>
      </article>
    </section>
  );
}

export function CharacterReviewSection(props: CharacterReviewSectionProps) {
  return (
    <article className="panel panel-stack">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Character Review</p>
          <h2>Recognition-only character reps</h2>
        </div>
        <div className="summary-chip-group">
          <span className="summary-chip">{props.dueCount} due</span>
          <span className="summary-chip">{formatReviewCount(props.reviewedCount, props.totalCount)}</span>
        </div>
      </div>

      {props.item ? (
        <>
          <section className="review-prompt-card">
            <p className="section-kicker">Prompt</p>
            <div className="prompt-text">{props.item.hanzi}</div>
            <div className="meta-row">
              <span>Due {formatDueDate(props.item.reviewState.dueAt)}</span>
              <span>{props.item.reviewState.reviewCount} prior reviews</span>
            </div>
          </section>

          {props.detail ? (
            <section className="answer-card">
              <p className="section-kicker">Reveal</p>
              <div className="answer-grid">
                <div>
                  <strong>Pinyin</strong>
                  <p>{formatNullable(props.detail.pinyinDisplay)}</p>
                </div>
                <div>
                  <strong>Meaning</strong>
                  <p>{formatNullable(props.detail.meaningPrimary)}</p>
                </div>
                <div>
                  <strong>Approved decomposition</strong>
                  <p>{formatDecomposition(props.detail)}</p>
                </div>
                <div>
                  <strong>Linked words</strong>
                  <p>{formatLinkedWords(props.detail)}</p>
                </div>
              </div>
            </section>
          ) : (
            <section className="answer-card answer-card-muted">
              <p className="section-kicker">Reveal</p>
              <p>{props.detailLoading ? "Loading stored answer data..." : "Reveal to see stored answer data."}</p>
            </section>
          )}

          <div className="review-actions">
            <button
              className="secondary-button"
              disabled={props.revealDisabled}
              onClick={props.onReveal}
              type="button"
            >
              {props.detailLoading ? "Loading..." : props.detail ? "Revealed" : "Reveal Answer"}
            </button>

            <div className="grade-grid">
              {reviewGrades.map((grade) => (
                <button
                  className={`grade-button grade-${grade}`}
                  disabled={!props.detail || props.gradeSubmitting}
                  key={grade}
                  onClick={() => props.onGrade(grade)}
                  type="button"
                >
                  {props.gradeSubmitting ? "Saving..." : formatGradeLabel(grade)}
                </button>
              ))}
            </div>
          </div>

          <p className="form-message left">{props.feedback ?? " "}</p>
        </>
      ) : (
        <section className="empty-state">
          <strong>No character reviews due.</strong>
          <p>Character review is complete for now. Word review remains separate below.</p>
        </section>
      )}
    </article>
  );
}

export function WordReviewSection(props: WordReviewSectionProps) {
  const [draftSentenceText, setDraftSentenceText] = useState("");
  const [draftSentenceTranslation, setDraftSentenceTranslation] = useState("");
  const [draftSentencePinyin, setDraftSentencePinyin] = useState("");

  useEffect(() => {
    setDraftSentenceText("");
    setDraftSentenceTranslation("");
    setDraftSentencePinyin("");
  }, [props.item?.id]);

  async function handleManualSentenceSubmit() {
    const saved = await props.onAddManualSentence({
      text: draftSentenceText,
      translation: draftSentenceTranslation,
      pinyinFull: draftSentencePinyin
    });

    if (saved) {
      setDraftSentenceText("");
      setDraftSentenceTranslation("");
      setDraftSentencePinyin("");
    }
  }

  return (
    <article className="panel panel-stack">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Word Review</p>
          <h2>Recognition-only word reps</h2>
        </div>
        <div className="summary-chip-group">
          <span className="summary-chip">{props.dueCount} due</span>
          <span className="summary-chip">{formatReviewCount(props.reviewedCount, props.totalCount)}</span>
        </div>
      </div>

      {props.item ? (
        <>
          <section className="review-prompt-card">
            <p className="section-kicker">Prompt</p>
            <div className="prompt-text">{props.item.simplified}</div>
            <div className="meta-row">
              <span>Due {formatDueDate(props.item.reviewState.dueAt)}</span>
              <span>{props.item.reviewState.reviewCount} prior reviews</span>
            </div>
          </section>

          {props.detail ? (
            <section className="answer-card">
              <p className="section-kicker">Reveal</p>
              <div className="answer-grid">
                <div>
                  <strong>Pinyin</strong>
                  <p>{formatNullable(props.detail.pinyinDisplay)}</p>
                </div>
                <div>
                  <strong>Meaning</strong>
                  <p>{formatNullable(props.detail.meaningPrimary)}</p>
                </div>
                <div className="answer-grid-span">
                  <strong>Component characters</strong>
                  <ul className="component-list">
                    {props.detail.componentCharacters.map((character) => (
                      <li key={character.id}>
                        <span>{character.hanzi}</span>
                        <span>{formatNullable(character.pinyinDisplay)}</span>
                        <span>{formatNullable(character.meaningPrimary)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="answer-grid-span">
                  <strong>Sentence bank</strong>
                  <SentenceBank sentences={props.detail.approvedSentences} />
                </div>
              </div>

              <div className="panel-stack">
                <div>
                  <strong>Add manual sentence</strong>
                  <p className="item-note">
                    Manual entries auto-approve and can link other known words found in the sentence text.
                  </p>
                </div>
                <label>
                  Sentence text
                  <textarea
                    onChange={(event) => setDraftSentenceText(event.target.value)}
                    rows={3}
                    value={draftSentenceText}
                  />
                </label>
                <label>
                  Translation
                  <input
                    onChange={(event) => setDraftSentenceTranslation(event.target.value)}
                    type="text"
                    value={draftSentenceTranslation}
                  />
                </label>
                <label>
                  Full pinyin
                  <input
                    onChange={(event) => setDraftSentencePinyin(event.target.value)}
                    type="text"
                    value={draftSentencePinyin}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={props.sentenceSubmitting || draftSentenceText.trim().length === 0}
                  onClick={() => void handleManualSentenceSubmit()}
                  type="button"
                >
                  {props.sentenceSubmitting ? "Saving..." : "Add Sentence"}
                </button>
              </div>
            </section>
          ) : (
            <section className="answer-card answer-card-muted">
              <p className="section-kicker">Reveal</p>
              <p>{props.detailLoading ? "Loading stored answer data..." : "Reveal to see stored answer data."}</p>
            </section>
          )}

          <div className="review-actions">
            <button
              className="secondary-button"
              disabled={props.revealDisabled}
              onClick={props.onReveal}
              type="button"
            >
              {props.detailLoading ? "Loading..." : props.detail ? "Revealed" : "Reveal Answer"}
            </button>

            <div className="grade-grid">
              {reviewGrades.map((grade) => (
                <button
                  className={`grade-button grade-${grade}`}
                  disabled={!props.detail || props.gradeSubmitting || props.sentenceSubmitting}
                  key={grade}
                  onClick={() => props.onGrade(grade)}
                  type="button"
                >
                  {props.gradeSubmitting ? "Saving..." : formatGradeLabel(grade)}
                </button>
              ))}
            </div>
          </div>

          <p className="form-message left">{props.feedback ?? " "}</p>
        </>
      ) : (
        <section className="empty-state">
          <strong>No word reviews due.</strong>
          <p>Word review is complete for now. Character review remains separate above.</p>
        </section>
      )}
    </article>
  );
}

async function expectJson<T>(path: string, signal?: AbortSignal) {
  const response = await fetch(`${apiBaseUrl}${path}`, { signal });

  if (!response.ok) {
    throw new Error(`${path} failed with status ${response.status}`);
  }

  return await response.json() as T;
}

async function expectPost<T>(path: string) {
  const response = await fetch(`${apiBaseUrl}${path}`, { method: "POST" });

  if (!response.ok) {
    const payload = await response.json() as { error?: string };
    throw new Error(payload.error ?? `${path} failed with status ${response.status}`);
  }

  return await response.json() as T;
}

async function expectPostWithBody<T>(path: string, body: unknown) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const payload = await response.json() as { error?: string };
    throw new Error(payload.error ?? `${path} failed with status ${response.status}`);
  }

  return await response.json() as T;
}

async function expectPutWithBody<T>(path: string, body: unknown) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const payload = await response.json() as { error?: string };
    throw new Error(payload.error ?? `${path} failed with status ${response.status}`);
  }

  return await response.json() as T;
}

export function App() {
  const [health, setHealth] = useState<HealthcheckResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummaryResponse | null>(null);
  const [queueHub, setQueueHub] = useState<QueueListResponse | null>(null);
  const [propsList, setPropsList] = useState<PropRecord[]>([]);
  const [activeQueueType, setActiveQueueType] = useState<QueueItemType>(QueueItemType.DecompositionCandidate);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);

  const [characterQueue, setCharacterQueue] = useState<DueCharacterReviewItem[]>([]);
  const [characterTotalCount, setCharacterTotalCount] = useState(0);
  const [characterReviewedCount, setCharacterReviewedCount] = useState(0);
  const [characterDetail, setCharacterDetail] = useState<CharacterDetailRecord | null>(null);
  const [characterDetailLoading, setCharacterDetailLoading] = useState(false);
  const [characterGradeSubmitting, setCharacterGradeSubmitting] = useState(false);
  const [characterFeedback, setCharacterFeedback] = useState<string | null>(null);

  const [wordQueue, setWordQueue] = useState<DueWordReviewItem[]>([]);
  const [wordTotalCount, setWordTotalCount] = useState(0);
  const [wordReviewedCount, setWordReviewedCount] = useState(0);
  const [wordDetail, setWordDetail] = useState<WordDetailRecord | null>(null);
  const [wordDetailLoading, setWordDetailLoading] = useState(false);
  const [wordGradeSubmitting, setWordGradeSubmitting] = useState(false);
  const [wordSentenceSubmitting, setWordSentenceSubmitting] = useState(false);
  const [wordFeedback, setWordFeedback] = useState<string | null>(null);

  const [learningSubmittingItemId, setLearningSubmittingItemId] = useState<string | null>(null);
  const [decompositionSubmittingCharacterId, setDecompositionSubmittingCharacterId] = useState<string | null>(null);
  const [learningFeedback, setLearningFeedback] = useState<string | null>(null);
  const [propEditingId, setPropEditingId] = useState<string | null>(null);
  const [propsLoading, setPropsLoading] = useState(false);
  const [propsFeedback, setPropsFeedback] = useState<string | null>(null);
  const [queueActionItemId, setQueueActionItemId] = useState<string | null>(null);
  const [queueFeedback, setQueueFeedback] = useState<string | null>(null);

  const currentCharacter = characterQueue[0] ?? null;
  const currentWord = wordQueue[0] ?? null;

  async function refreshDashboard() {
    const nextDashboard = await expectJson<DashboardSummaryResponse>("/dashboard");
    setDashboard(nextDashboard);
  }

  async function loadProps() {
    setPropsLoading(true);

    try {
      const response = await expectJson<{ items: PropRecord[] }>("/props");
      setPropsList(response.items);
    } finally {
      setPropsLoading(false);
    }
  }

  async function loadPage(signal?: AbortSignal) {
    setLoadingPage(true);

    try {
      const [nextHealth, nextDashboard, nextCharacterQueue, nextWordQueue, nextQueueHub, nextPropsResponse] = await Promise.all([
        expectJson<HealthcheckResponse>(HEALTHCHECK_PATH, signal),
        expectJson<DashboardSummaryResponse>("/dashboard", signal),
        expectJson<CharacterReviewQueueResponse>("/reviews/characters/due", signal),
        expectJson<WordReviewQueueResponse>("/reviews/words/due", signal),
        expectJson<QueueListResponse>("/queue", signal),
        expectJson<{ items: PropRecord[] }>("/props", signal)
      ]);

      setHealth(nextHealth);
      setDashboard(nextDashboard);
      setQueueHub(nextQueueHub);
      setPropsList(nextPropsResponse.items);
      setActiveQueueType((current) => {
        const stillVisible = nextQueueHub.counts.some((count) => count.type === current && count.count > 0);
        return stillVisible ? current : getDefaultQueueType(nextQueueHub);
      });
      setCharacterQueue(nextCharacterQueue.items);
      setCharacterTotalCount(nextCharacterQueue.items.length);
      setCharacterReviewedCount(0);
      setCharacterDetail(null);
      setCharacterFeedback(null);
      setWordQueue(nextWordQueue.items);
      setWordTotalCount(nextWordQueue.items.length);
      setWordReviewedCount(0);
      setWordDetail(null);
      setWordFeedback(null);
      setPropsFeedback(null);
      setQueueFeedback(null);
      setPageError(null);
    } catch (error) {
      if (!signal?.aborted) {
        setPageError(error instanceof Error ? error.message : "Unknown startup error");
      }
    } finally {
      if (!signal?.aborted) {
        setLoadingPage(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadPage(controller.signal);
    return () => controller.abort();
  }, []);

  async function revealCharacter() {
    if (!currentCharacter || characterDetail || characterDetailLoading) {
      return;
    }

    setCharacterDetailLoading(true);

    try {
      const detail = await expectJson<CharacterDetailRecord>(`/characters/${currentCharacter.id}`);
      setCharacterDetail(detail);
      setCharacterFeedback("Stored answer data revealed.");
    } catch (error) {
      setCharacterFeedback(error instanceof Error ? error.message : "Unknown character reveal error");
    } finally {
      setCharacterDetailLoading(false);
    }
  }

  async function revealWord() {
    if (!currentWord || wordDetail || wordDetailLoading) {
      return;
    }

    setWordDetailLoading(true);

    try {
      const detail = await expectJson<WordDetailRecord>(`/words/${currentWord.id}`);
      setWordDetail(detail);
      setWordFeedback("Stored answer data revealed.");
    } catch (error) {
      setWordFeedback(error instanceof Error ? error.message : "Unknown word reveal error");
    } finally {
      setWordDetailLoading(false);
    }
  }

  function advanceCharacterQueue(submission: ReviewSubmissionResult, itemId: string) {
    setCharacterQueue((current) => current.filter((item) => item.id !== itemId));
    setCharacterReviewedCount((current) => current + 1);
    setCharacterDetail(null);
    setCharacterFeedback(`Saved ${submission.grade}. Next due ${formatDueDate(submission.reviewState.dueAt)}.`);
    setDashboard((current) => current ? {
      ...current,
      dueReview: {
        characterCount: Math.max(0, current.dueReview.characterCount - 1),
        wordCount: current.dueReview.wordCount,
        totalCount: Math.max(0, current.dueReview.totalCount - 1)
      }
    } : current);
  }

  function advanceWordQueue(submission: ReviewSubmissionResult, itemId: string) {
    setWordQueue((current) => current.filter((item) => item.id !== itemId));
    setWordReviewedCount((current) => current + 1);
    setWordDetail(null);
    setWordFeedback(`Saved ${submission.grade}. Next due ${formatDueDate(submission.reviewState.dueAt)}.`);
    setDashboard((current) => current ? {
      ...current,
      dueReview: {
        characterCount: current.dueReview.characterCount,
        wordCount: Math.max(0, current.dueReview.wordCount - 1),
        totalCount: Math.max(0, current.dueReview.totalCount - 1)
      }
    } : current);
  }

  async function gradeCharacter(grade: ReviewGrade) {
    if (!currentCharacter || !characterDetail) {
      return;
    }

    setCharacterGradeSubmitting(true);

    try {
      const submission = await expectPostWithBody<ReviewSubmissionResult>(
        `/reviews/characters/${currentCharacter.id}/grade`,
        { grade }
      );
      advanceCharacterQueue(submission, currentCharacter.id);
    } catch (error) {
      setCharacterFeedback(error instanceof Error ? error.message : "Unknown character grading error");
    } finally {
      setCharacterGradeSubmitting(false);
    }
  }

  async function gradeWord(grade: ReviewGrade) {
    if (!currentWord || !wordDetail) {
      return;
    }

    setWordGradeSubmitting(true);

    try {
      const submission = await expectPostWithBody<ReviewSubmissionResult>(
        `/reviews/words/${currentWord.id}/grade`,
        { grade }
      );
      advanceWordQueue(submission, currentWord.id);
    } catch (error) {
      setWordFeedback(error instanceof Error ? error.message : "Unknown word grading error");
    } finally {
      setWordGradeSubmitting(false);
    }
  }

  async function addManualSentence(values: ManualSentenceFormValues) {
    if (!currentWord || !wordDetail) {
      return false;
    }

    setWordSentenceSubmitting(true);

    try {
      const sentence = await expectPostWithBody<SentenceDisplayRecord>(
        `/words/${currentWord.id}/manual-sentences`,
        values
      );
      setWordDetail((current) => current && current.id === currentWord.id ? {
        ...current,
        approvedSentences: [
          sentence,
          ...current.approvedSentences.filter((item) => item.id !== sentence.id)
        ]
      } : current);
      setWordFeedback("Manual sentence saved and added to the sentence bank.");
      return true;
    } catch (error) {
      setWordFeedback(error instanceof Error ? error.message : "Unknown manual sentence error");
      return false;
    } finally {
      setWordSentenceSubmitting(false);
    }
  }

  async function markCharacterLearned(character: LearningCharacterState) {
    setLearningSubmittingItemId(character.id);

    try {
      await expectPost<CurrentLevelProgressResponse>(`/learning/characters/${character.id}/learned`);
      await loadPage();
      setLearningFeedback(`${character.hanzi} marked learned.`);
      scrollToSection("learning-section");
    } catch (error) {
      setLearningFeedback(error instanceof Error ? error.message : "Unknown learning update error");
    } finally {
      setLearningSubmittingItemId(null);
    }
  }

  async function markWordLearned(word: LearningWordState) {
    setLearningSubmittingItemId(word.id);

    try {
      await expectPost<CurrentLevelProgressResponse>(`/learning/words/${word.id}/learned`);
      await loadPage();
      setLearningFeedback(`${word.simplified} marked learned.`);
      scrollToSection("learning-section");
    } catch (error) {
      setLearningFeedback(error instanceof Error ? error.message : "Unknown learning update error");
    } finally {
      setLearningSubmittingItemId(null);
    }
  }

  async function createDecompositionCandidate(
    character: LearningCharacterState,
    values: DecompositionCandidateFormValues
  ) {
    const payload: DecompositionCandidateCreateInputPayload = {
      parts: parseDecompositionParts(values.partsText),
      notes: values.notes.trim().length > 0 ? values.notes : null
    };

    setDecompositionSubmittingCharacterId(character.id);

    try {
      await expectPostWithBody(`/characters/${character.id}/decomposition-candidates`, payload);
      await loadPage();
      setLearningFeedback(
        `${character.hanzi} candidate created. Resolve any literal parts in the queue, then approve the candidate.`
      );
      setActiveQueueType(QueueItemType.DecompositionCandidate);
      scrollToSection("queue-section");
    } catch (error) {
      setLearningFeedback(error instanceof Error ? error.message : "Unknown decomposition candidate error");
    } finally {
      setDecompositionSubmittingCharacterId(null);
    }
  }

  async function saveProp(input: PropAdminInput, propId: string | null) {
    setPropEditingId(propId ?? "__new__");

    try {
      if (propId) {
        await expectPutWithBody<PropRecord>(`/props/${propId}`, input);
        setPropsFeedback(`${input.name} updated.`);
      } else {
        await expectPostWithBody<PropRecord>("/props", input);
        setPropsFeedback(`${input.name} created.`);
      }

      await loadProps();
      void expectJson<QueueListResponse>("/queue").then((nextQueueHub) => {
        setQueueHub(nextQueueHub);
        setActiveQueueType((current) => {
          const stillVisible = nextQueueHub.counts.some((count) => count.type === current && count.count > 0);
          return stillVisible ? current : getDefaultQueueType(nextQueueHub);
        });
      }).catch(() => undefined);
    } catch (error) {
      setPropsFeedback(error instanceof Error ? error.message : "Unknown prop save error");
    } finally {
      setPropEditingId(null);
    }
  }

  async function updateQueueHub(itemId: string, body: unknown, successMessage: string) {
    setQueueActionItemId(itemId);

    try {
      const nextQueueHub = await expectPostWithBody<QueueListResponse>(`/queue/items/${itemId}/actions`, body);
      setQueueHub(nextQueueHub);
      setActiveQueueType((current) => {
        const stillVisible = nextQueueHub.counts.some((count) => count.type === current && count.count > 0);
        return stillVisible ? current : getDefaultQueueType(nextQueueHub);
      });
      await refreshDashboard();
      setQueueFeedback(successMessage);
    } catch (error) {
      setQueueFeedback(error instanceof Error ? error.message : "Unknown queue update error");
    } finally {
      setQueueActionItemId(null);
    }
  }

  async function approveCandidate(item: QueueDecompositionCandidateItem) {
    await updateQueueHub(
      item.id,
      { action: "approve_decomposition_candidate" },
      `${item.character.hanzi} candidate approved.`
    );
  }

  async function resolveWithSuggestion(item: QueueUnresolvedPropItem) {
    const suggestion = item.part.existingPropOptions[0];

    if (!suggestion) {
      setQueueFeedback("No existing prop suggestion is available for this item.");
      return;
    }

    await updateQueueHub(
      item.id,
      {
        action: "resolve_unresolved_prop",
        resolution: {
          action: "match_existing_prop",
          propId: suggestion.id
        }
      },
      `${item.part.literalText} resolved with ${suggestion.name}.`
    );
  }

  async function createLiteralProp(item: QueueUnresolvedPropItem) {
    await updateQueueHub(
      item.id,
      {
        action: "resolve_unresolved_prop",
        resolution: {
          action: "create_new_prop",
          name: `Literal ${item.part.literalText}`,
          shapeRef: item.part.literalText,
          meaningOrImage: `Queue-created prop for ${item.part.literalText}`,
          notes: "Created from the queue hub"
        }
      },
      `${item.part.literalText} resolved by creating a prop.`
    );
  }

  async function approveSentence(item: QueueSentenceCandidateItem) {
    await updateQueueHub(
      item.id,
      { action: "approve_sentence_candidate" },
      "Sentence candidate approved."
    );
  }

  async function rejectSentence(item: QueueSentenceCandidateItem) {
    await updateQueueHub(
      item.id,
      { action: "reject_sentence_candidate" },
      "Sentence candidate rejected."
    );
  }

  async function editApproveSentence(item: QueueSentenceCandidateItem, values: SentenceCandidateEditValues) {
    await updateQueueHub(
      item.id,
      {
        action: "edit_and_approve_sentence_candidate",
        text: values.text,
        translation: values.translation,
        pinyinFull: values.pinyinFull
      },
      "Sentence candidate edited and approved."
    );
  }

  async function regenerateSentence(item: QueueSentenceCandidateItem) {
    await updateQueueHub(
      item.id,
      { action: "regenerate_sentence_candidate" },
      "Sentence candidate regenerated."
    );
    setTimeout(() => {
      void refreshDashboard();
      void expectJson<QueueListResponse>("/queue").then((nextQueueHub) => {
        setQueueHub(nextQueueHub);
        setActiveQueueType((current) => {
          const stillVisible = nextQueueHub.counts.some((count) => count.type === current && count.count > 0);
          return stillVisible ? current : getDefaultQueueType(nextQueueHub);
        });
      }).catch(() => undefined);
    }, 50);
  }

  async function regenerateAudio(item: QueueAudioFailureItem) {
    await updateQueueHub(
      item.id,
      { action: "regenerate_audio" },
      "Sentence audio regeneration queued."
    );
    setTimeout(() => {
      void refreshDashboard();
      void expectJson<QueueListResponse>("/queue").then((nextQueueHub) => {
        setQueueHub(nextQueueHub);
        setActiveQueueType((current) => {
          const stillVisible = nextQueueHub.counts.some((count) => count.type === current && count.count > 0);
          return stillVisible ? current : getDefaultQueueType(nextQueueHub);
        });
      }).catch(() => undefined);
    }, 50);
  }

  async function editMissingLexical(item: QueueMissingLexicalDataItem, values: MissingLexicalEditValues) {
    await updateQueueHub(
      item.id,
      {
        action: "edit_missing_lexical_data",
        pinyinDisplay: values.pinyinDisplay,
        meaningPrimary: values.meaningPrimary,
        provenanceNote: values.provenanceNote
      },
      `${item.target.text} lexical data updated.`
    );
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Ticket 021</p>
        <h1>V1 Study Workspace</h1>
        <p className="hero-copy">
          Review, learning, queue cleanup, sentence work, and audio recovery now share one local V1 shell with actionable blocker states.
        </p>
        <div className="hero-status">
          <span>API: {health ? `${health.status} @ ${health.databasePath}` : pageError ?? "Loading..."}</span>
          <span>{dashboard ? `${dashboard.dueReview.totalCount} review items due` : "Loading dashboard..."}</span>
          <span>{dashboard ? `${dashboard.contentQueue.totalCount} queue items open` : "Loading queue..."}</span>
        </div>
      </section>

      {pageError ? (
        <section className="workspace">
          <article className="panel">
            <p className="empty-state">{pageError}</p>
            <button className="secondary-button" onClick={() => void loadPage()} type="button">
              Retry
            </button>
          </article>
        </section>
      ) : null}

      {!pageError && loadingPage ? (
        <section className="workspace">
          <article className="panel">
            <p className="empty-state">Loading dashboard, queue, learning progress, and due review...</p>
          </article>
        </section>
      ) : null}

      {!pageError && !loadingPage && dashboard && queueHub ? (
        <>
          <DashboardOverviewSection
            dashboard={dashboard}
            onOpenLearning={() => scrollToSection("learning-section")}
            onOpenProps={() => scrollToSection("props-section")}
            onOpenQueue={() => scrollToSection("queue-section")}
            onOpenReview={() => scrollToSection("review-section")}
          />

          <QueueHubSection
            actionItemId={queueActionItemId}
            activeType={activeQueueType}
            feedback={queueFeedback}
            onApproveCandidate={(item) => void approveCandidate(item)}
            onApproveSentence={(item) => void approveSentence(item)}
            onCreateLiteralProp={(item) => void createLiteralProp(item)}
            onEditApproveSentence={(item, values) => void editApproveSentence(item, values)}
            onEditMissingLexical={(item, values) => void editMissingLexical(item, values)}
            onRegenerateAudio={(item) => void regenerateAudio(item)}
            onRegenerateSentence={(item) => void regenerateSentence(item)}
            onRejectSentence={(item) => void rejectSentence(item)}
            onResolveWithSuggestion={(item) => void resolveWithSuggestion(item)}
            onSelectType={setActiveQueueType}
            queue={queueHub}
          />

          <LearningSection
            decompositionSubmittingCharacterId={decompositionSubmittingCharacterId}
            feedback={learningFeedback}
            onCreateDecompositionCandidate={(character, values) => void createDecompositionCandidate(character, values)}
            onMarkCharacterLearned={(character) => void markCharacterLearned(character)}
            onMarkWordLearned={(word) => void markWordLearned(word)}
            progress={dashboard.learningProgress}
            submittingItemId={learningSubmittingItemId}
          />

          <PropsSection
            editingPropId={propEditingId}
            feedback={propsFeedback}
            loading={propsLoading}
            onSave={(input, propId) => void saveProp(input, propId)}
            propsList={propsList}
          />

          <section className="workspace review-layout" id="review-section">
            <CharacterReviewSection
              detail={characterDetail}
              detailLoading={characterDetailLoading}
              dueCount={characterQueue.length}
              feedback={characterFeedback}
              gradeSubmitting={characterGradeSubmitting}
              item={currentCharacter}
              onGrade={(grade) => void gradeCharacter(grade)}
              onReveal={() => void revealCharacter()}
              revealDisabled={!currentCharacter || characterDetailLoading || characterDetail !== null}
              reviewedCount={characterReviewedCount}
              totalCount={characterTotalCount}
            />
            <WordReviewSection
              detail={wordDetail}
              detailLoading={wordDetailLoading}
              dueCount={wordQueue.length}
              feedback={wordFeedback}
              gradeSubmitting={wordGradeSubmitting}
              item={currentWord}
              onAddManualSentence={addManualSentence}
              onGrade={(grade) => void gradeWord(grade)}
              onReveal={() => void revealWord()}
              revealDisabled={!currentWord || wordDetailLoading || wordDetail !== null}
              reviewedCount={wordReviewedCount}
              sentenceSubmitting={wordSentenceSubmitting}
              totalCount={wordTotalCount}
            />
          </section>
        </>
      ) : null}
    </main>
  );
}
