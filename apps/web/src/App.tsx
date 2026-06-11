import { useEffect, useState } from "react";
import {
  HEALTHCHECK_PATH,
  ItemStatus,
  QueueItemType,
  ReviewGrade,
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
  type QueueListItem,
  type QueueListResponse,
  type QueueMissingLexicalDataItem,
  type QueueTypeCount,
  type QueueUnresolvedPropItem,
  type ReviewSubmissionResult,
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
  onReveal: () => void;
  onGrade: (grade: ReviewGrade) => void;
}

interface DashboardOverviewSectionProps {
  dashboard: DashboardSummaryResponse;
  onOpenReview: () => void;
  onOpenLearning: () => void;
  onOpenQueue: () => void;
}

interface LearningSectionProps {
  progress: CurrentLevelProgressResponse;
  feedback: string | null;
  submittingItemId: string | null;
  onMarkCharacterLearned: (character: LearningCharacterState) => void;
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
}

const reviewGrades = [
  ReviewGrade.Again,
  ReviewGrade.Hard,
  ReviewGrade.Good,
  ReviewGrade.Easy
] as const;

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

function formatBlockedReason(reason: string) {
  return reason.replaceAll("_", " ");
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

function LearningItemCard(props: {
  title: string;
  subtitle: string;
  status: ItemStatus;
  blockedReasons: string[];
  actionLabel: string;
  actionDisabled: boolean;
  actionBusy: boolean;
  onAction: () => void;
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
        <p className="item-note">Blocked by: {props.blockedReasons.map(formatBlockedReason).join(", ")}</p>
      ) : null}

      {props.status === ItemStatus.Learned ? (
        <p className="item-note">Already learned and available for review scheduling.</p>
      ) : null}

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
          <strong>Linked words</strong>
          <p>{props.item.linkedWords.length > 0 ? props.item.linkedWords.map((word) => word.simplified).join(", ") : "None"}</p>
        </div>
      </div>
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

function QueueMissingLexicalCard(props: { item: QueueMissingLexicalDataItem }) {
  return (
    <article className="queue-card">
      <div className="queue-card-header">
        <div>
          <p className="section-kicker">Missing Lexical Data</p>
          <h3>{props.item.target.text}</h3>
        </div>
        <span className="summary-chip">{props.item.target.kind}</span>
      </div>
      <p className="item-note">Missing {props.item.missingFields.join(", ")}. Edit this item through the existing lexical detail flow.</p>
    </article>
  );
}

function QueueGenericSentenceCard(props: { item: Extract<QueueListItem, { type: QueueItemType.SentenceCandidate | QueueItemType.AudioFailure }> }) {
  return (
    <article className="queue-card">
      <div className="queue-card-header">
        <div>
          <p className="section-kicker">{queueTypeLabels[props.item.type]}</p>
          <h3>{props.item.sentence.text}</h3>
        </div>
        <span className="summary-chip">{props.item.availableActions[0]?.label ?? "Pending"}</span>
      </div>
      <p className="item-note">{formatNullable(props.item.sentence.translation)}</p>
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
                  return <QueueMissingLexicalCard item={item} key={item.id} />;
                case QueueItemType.SentenceCandidate:
                case QueueItemType.AudioFailure:
                  return <QueueGenericSentenceCard item={item} key={item.id} />;
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

export function App() {
  const [health, setHealth] = useState<HealthcheckResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummaryResponse | null>(null);
  const [queueHub, setQueueHub] = useState<QueueListResponse | null>(null);
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
  const [wordFeedback, setWordFeedback] = useState<string | null>(null);

  const [learningSubmittingItemId, setLearningSubmittingItemId] = useState<string | null>(null);
  const [learningFeedback, setLearningFeedback] = useState<string | null>(null);
  const [queueActionItemId, setQueueActionItemId] = useState<string | null>(null);
  const [queueFeedback, setQueueFeedback] = useState<string | null>(null);

  const currentCharacter = characterQueue[0] ?? null;
  const currentWord = wordQueue[0] ?? null;

  async function refreshDashboard() {
    const nextDashboard = await expectJson<DashboardSummaryResponse>("/dashboard");
    setDashboard(nextDashboard);
  }

  async function loadPage(signal?: AbortSignal) {
    setLoadingPage(true);

    try {
      const [nextHealth, nextDashboard, nextCharacterQueue, nextWordQueue, nextQueueHub] = await Promise.all([
        expectJson<HealthcheckResponse>(HEALTHCHECK_PATH, signal),
        expectJson<DashboardSummaryResponse>("/dashboard", signal),
        expectJson<CharacterReviewQueueResponse>("/reviews/characters/due", signal),
        expectJson<WordReviewQueueResponse>("/reviews/words/due", signal),
        expectJson<QueueListResponse>("/queue", signal)
      ]);

      setHealth(nextHealth);
      setDashboard(nextDashboard);
      setQueueHub(nextQueueHub);
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

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Ticket 015</p>
        <h1>Content Queue Hub</h1>
        <p className="hero-copy">
          One queue area now tracks decomposition candidates, unresolved props, sentence moderation, audio failures, and lexical cleanup work.
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
            onOpenQueue={() => scrollToSection("queue-section")}
            onOpenReview={() => scrollToSection("review-section")}
          />

          <QueueHubSection
            actionItemId={queueActionItemId}
            activeType={activeQueueType}
            feedback={queueFeedback}
            onApproveCandidate={(item) => void approveCandidate(item)}
            onCreateLiteralProp={(item) => void createLiteralProp(item)}
            onResolveWithSuggestion={(item) => void resolveWithSuggestion(item)}
            onSelectType={setActiveQueueType}
            queue={queueHub}
          />

          <LearningSection
            feedback={learningFeedback}
            onMarkCharacterLearned={(character) => void markCharacterLearned(character)}
            onMarkWordLearned={(word) => void markWordLearned(word)}
            progress={dashboard.learningProgress}
            submittingItemId={learningSubmittingItemId}
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
              onGrade={(grade) => void gradeWord(grade)}
              onReveal={() => void revealWord()}
              revealDisabled={!currentWord || wordDetailLoading || wordDetail !== null}
              reviewedCount={wordReviewedCount}
              totalCount={wordTotalCount}
            />
          </section>
        </>
      ) : null}
    </main>
  );
}
