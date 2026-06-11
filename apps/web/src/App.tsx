import { useEffect, useState } from "react";
import {
  HEALTHCHECK_PATH,
  ItemStatus,
  type CurrentLevelProgressResponse,
  type HealthcheckResponse,
  type LearningBlockReason,
  type LearningCharacterState,
  type LearningWordState
} from "@hanzi-learning-app/shared";

const apiBaseUrl = "http://localhost:3001";

const blockedReasonLabels: Record<LearningBlockReason, string> = {
  missing_text: "Missing text",
  missing_pinyin: "Missing pinyin",
  missing_pinyin_split: "Missing pinyin split",
  missing_primary_meaning: "Missing primary meaning",
  missing_approved_decomposition: "Missing approved decomposition",
  component_characters_unlearned: "Waiting on component characters"
};

function formatNullable(value: string | null) {
  return value ?? "Not set";
}

function formatStatus(status: ItemStatus) {
  if (status === ItemStatus.Learned) {
    return "Learned";
  }

  if (status === ItemStatus.Ready) {
    return "Ready";
  }

  if (status === ItemStatus.Blocked) {
    return "Blocked";
  }

  return "Archived";
}

function progressLabel(characters: LearningCharacterState[], words: LearningWordState[]) {
  const total = characters.length + words.length;
  const learned = [...characters, ...words].filter((item) => item.status === ItemStatus.Learned).length;
  return `${learned}/${total} learned`;
}

export function App() {
  const [health, setHealth] = useState<HealthcheckResponse | null>(null);
  const [progress, setProgress] = useState<CurrentLevelProgressResponse | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPage() {
      try {
        const [healthResponse, progressResponse] = await Promise.all([
          fetch(`${apiBaseUrl}${HEALTHCHECK_PATH}`, { signal: controller.signal }),
          fetch(`${apiBaseUrl}/levels/current`, { signal: controller.signal })
        ]);

        if (!healthResponse.ok) {
          throw new Error(`Healthcheck failed with status ${healthResponse.status}`);
        }

        if (!progressResponse.ok) {
          throw new Error(`Current level failed with status ${progressResponse.status}`);
        }

        setHealth(await healthResponse.json() as HealthcheckResponse);
        setProgress(await progressResponse.json() as CurrentLevelProgressResponse);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setPageError(error instanceof Error ? error.message : "Unknown startup error");
      }
    }

    void loadPage();
    return () => controller.abort();
  }, []);

  async function markLearned(kind: "character" | "word", id: string) {
    setSubmittingKey(`${kind}:${id}`);
    setActionMessage("Saving learned state...");

    try {
      const response = await fetch(`${apiBaseUrl}/learning/${kind === "character" ? "characters" : "words"}/${id}/learned`, {
        method: "POST"
      });

      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? `Failed to mark ${kind} learned (${response.status})`);
      }

      const nextProgress = await response.json() as CurrentLevelProgressResponse;
      setProgress(nextProgress);
      setActionMessage(`${kind === "character" ? "Character" : "Word"} learned.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Unknown learning action error");
    } finally {
      setSubmittingKey(null);
    }
  }

  const level = progress?.level ?? null;
  const nextCharacter = level?.characters.find((character) => character.id === level.nextCharacterId) ?? null;
  const totalLevelCount = progress?.totalLevelCount ?? 0;

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Ticket 008</p>
        <h1>Level Progression And Learning Mode</h1>
        <p className="hero-copy">
          Work through the imported curriculum in order, learn the next eligible character, and unlock words as soon as their component characters are known.
        </p>
        <div className="hero-status">
          <span>API: {health ? `${health.status} @ ${health.databasePath}` : pageError ?? "Loading..."}</span>
          <span>{progress ? `${progress.learnedCharacterCount} characters known` : "Loading character progress..."}</span>
          <span>{progress ? `${progress.learnedWordCount} words known` : "Loading word progress..."}</span>
        </div>
      </section>

      {pageError ? (
        <section className="workspace">
          <article className="panel">
            <p className="empty-state">{pageError}</p>
          </article>
        </section>
      ) : null}

      {!pageError && progress?.courseComplete ? (
        <section className="workspace">
          <article className="panel celebration-panel">
            <p className="section-kicker">Course Complete</p>
            <h2>Every imported level item is learned.</h2>
            <p className="hero-copy">This ticket stops at learning mode, so review scheduling begins in a later ticket.</p>
          </article>
        </section>
      ) : null}

      {!pageError && level ? (
        <section className="workspace learning-layout">
          <article className="panel panel-stack">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Current Level</p>
                <h2>{level.title ?? `Level ${level.sequenceNumber}`}</h2>
              </div>
              <div className="summary-chip-group">
                <span className="summary-chip">{level.course}</span>
                <span className="summary-chip">{progressLabel(level.characters, level.words)}</span>
                <span className="summary-chip">{totalLevelCount} total levels</span>
              </div>
            </div>

            <section className="focus-card">
              <p className="section-kicker">Next Character</p>
              {nextCharacter ? (
                <>
                  <div className="focus-header">
                    <h3>{nextCharacter.hanzi}</h3>
                    <span className={`status-pill ${nextCharacter.status}`}>{formatStatus(nextCharacter.status)}</span>
                  </div>
                  <p className="focus-copy">
                    {formatNullable(nextCharacter.pinyinDisplay)} / {formatNullable(nextCharacter.meaningPrimary)}
                  </p>
                  <p className="helper-copy">
                    Split: {formatNullable(nextCharacter.pinyinInitial)} / {formatNullable(nextCharacter.pinyinFinal)} / {formatNullable(nextCharacter.tone)}
                  </p>
                  <p className="helper-copy">
                    Approved decomposition: {nextCharacter.hasApprovedDecomposition ? "Ready" : "Missing"}
                  </p>
                  {nextCharacter.status === ItemStatus.Ready ? (
                    <button
                      className="primary-button"
                      disabled={submittingKey === `character:${nextCharacter.id}`}
                      onClick={() => void markLearned("character", nextCharacter.id)}
                      type="button"
                    >
                      {submittingKey === `character:${nextCharacter.id}` ? "Saving..." : "Mark Character Learned"}
                    </button>
                  ) : (
                    <p className="empty-state compact">
                      {nextCharacter.blockedReasons.map((reason) => blockedReasonLabels[reason]).join(" · ")}
                    </p>
                  )}
                </>
              ) : (
                <p className="empty-state compact">All characters in this level are learned. Finish the remaining words to advance.</p>
              )}
            </section>

            <div className="form-actions">
              <p className="form-message left">{actionMessage ?? " "}</p>
            </div>
          </article>

          <article className="panel panel-stack">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Characters</p>
                <h2>Introduction order</h2>
              </div>
            </div>

            <div className="study-list">
              {level.characters.map((character) => (
                <article className="study-card" key={character.id}>
                  <div className="focus-header">
                    <strong>{character.hanzi}</strong>
                    <span className={`status-pill ${character.status}`}>{formatStatus(character.status)}</span>
                  </div>
                  <p>{formatNullable(character.pinyinDisplay)} / {formatNullable(character.meaningPrimary)}</p>
                  <p className="helper-copy">
                    Split: {formatNullable(character.pinyinInitial)} / {formatNullable(character.pinyinFinal)} / {formatNullable(character.tone)}
                  </p>
                  <p className="helper-copy">
                    {character.hasApprovedDecomposition ? "Approved decomposition present" : "Approved decomposition missing"}
                  </p>
                  {character.status === ItemStatus.Ready ? (
                    <button
                      className="secondary-button"
                      disabled={submittingKey === `character:${character.id}`}
                      onClick={() => void markLearned("character", character.id)}
                      type="button"
                    >
                      Mark Learned
                    </button>
                  ) : null}
                  {character.blockedReasons.length > 0 && character.status !== ItemStatus.Learned ? (
                    <p className="helper-copy">{character.blockedReasons.map((reason) => blockedReasonLabels[reason]).join(" · ")}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </article>

          <article className="panel panel-stack panel-span">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Words</p>
                <h2>Unlock as characters become known</h2>
              </div>
            </div>

            <div className="study-list word-grid">
              {level.words.map((word) => (
                <article className="study-card" key={word.id}>
                  <div className="focus-header">
                    <strong>{word.simplified}</strong>
                    <span className={`status-pill ${word.status}`}>{formatStatus(word.status)}</span>
                  </div>
                  <p>{formatNullable(word.pinyinDisplay)} / {formatNullable(word.meaningPrimary)}</p>
                  <p className="helper-copy">
                    Components: {word.componentCharacters.map((component) => `${component.hanzi} (${formatStatus(component.status)})`).join(", ")}
                  </p>
                  {word.status === ItemStatus.Ready ? (
                    <button
                      className="primary-button"
                      disabled={submittingKey === `word:${word.id}`}
                      onClick={() => void markLearned("word", word.id)}
                      type="button"
                    >
                      {submittingKey === `word:${word.id}` ? "Saving..." : "Mark Word Learned"}
                    </button>
                  ) : null}
                  {word.blockedReasons.length > 0 && word.status !== ItemStatus.Learned ? (
                    <p className="helper-copy">{word.blockedReasons.map((reason) => blockedReasonLabels[reason]).join(" · ")}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </article>
        </section>
      ) : null}
    </main>
  );
}
