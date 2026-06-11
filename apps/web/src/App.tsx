import { useEffect, useState } from "react";
import {
  HEALTHCHECK_PATH,
  ReviewGrade,
  type CharacterDetailRecord,
  type CharacterReviewQueueResponse,
  type DueCharacterReviewItem,
  type DueWordReviewItem,
  type HealthcheckResponse,
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

const reviewGrades = [
  ReviewGrade.Again,
  ReviewGrade.Hard,
  ReviewGrade.Good,
  ReviewGrade.Easy
] as const;

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

export function App() {
  const [health, setHealth] = useState<HealthcheckResponse | null>(null);
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

  const currentCharacter = characterQueue[0] ?? null;
  const currentWord = wordQueue[0] ?? null;

  async function loadPage(signal?: AbortSignal) {
    setLoadingPage(true);

    try {
      const [nextHealth, nextCharacterQueue, nextWordQueue] = await Promise.all([
        expectJson<HealthcheckResponse>(HEALTHCHECK_PATH, signal),
        expectJson<CharacterReviewQueueResponse>("/reviews/characters/due", signal),
        expectJson<WordReviewQueueResponse>("/reviews/words/due", signal)
      ]);

      setHealth(nextHealth);
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
  }

  function advanceWordQueue(submission: ReviewSubmissionResult, itemId: string) {
    setWordQueue((current) => current.filter((item) => item.id !== itemId));
    setWordReviewedCount((current) => current + 1);
    setWordDetail(null);
    setWordFeedback(`Saved ${submission.grade}. Next due ${formatDueDate(submission.reviewState.dueAt)}.`);
  }

  async function gradeCharacter(grade: ReviewGrade) {
    if (!currentCharacter || !characterDetail) {
      return;
    }

    setCharacterGradeSubmitting(true);

    try {
      const response = await fetch(`${apiBaseUrl}/reviews/characters/${currentCharacter.id}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade })
      });

      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? `Failed to grade character review (${response.status})`);
      }

      const submission = await response.json() as ReviewSubmissionResult;
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
      const response = await fetch(`${apiBaseUrl}/reviews/words/${currentWord.id}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade })
      });

      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? `Failed to grade word review (${response.status})`);
      }

      const submission = await response.json() as ReviewSubmissionResult;
      advanceWordQueue(submission, currentWord.id);
    } catch (error) {
      setWordFeedback(error instanceof Error ? error.message : "Unknown word grading error");
    } finally {
      setWordGradeSubmitting(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Ticket 012</p>
        <h1>Review Mode UI</h1>
        <p className="hero-copy">
          Run recognition-only review sessions for characters and words with separate due queues, stored-answer reveal, and direct FSRS grading.
        </p>
        <div className="hero-status">
          <span>API: {health ? `${health.status} @ ${health.databasePath}` : pageError ?? "Loading..."}</span>
          <span>{characterQueue.length} characters due</span>
          <span>{wordQueue.length} words due</span>
          <span>{characterReviewedCount + wordReviewedCount} items reviewed this visit</span>
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
            <p className="empty-state">Loading due review queues...</p>
          </article>
        </section>
      ) : null}

      {!pageError && !loadingPage ? (
        <section className="workspace review-layout">
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
      ) : null}
    </main>
  );
}
