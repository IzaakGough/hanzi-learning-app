import { useEffect, useMemo, useState } from "react";
import {
  HEALTHCHECK_PATH,
  ItemStatus,
  type CurrentLevelProgressResponse,
  type DecompositionCharacterWorkspace,
  type DecompositionPartResolutionInput,
  type DecompositionWorkspaceResponse,
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

type ResolutionMode = DecompositionPartResolutionInput["action"];

interface ResolutionDraft {
  action: ResolutionMode;
  propId: string;
  name: string;
  shapeRef: string;
  meaningOrImage: string;
  notes: string;
}

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

function createResolutionDraft(literalText: string, existingPropId?: string): ResolutionDraft {
  return {
    action: existingPropId ? "match_existing_prop" : "create_new_prop",
    propId: existingPropId ?? "",
    name: literalText,
    shapeRef: literalText,
    meaningOrImage: "",
    notes: ""
  };
}

export function App() {
  const [health, setHealth] = useState<HealthcheckResponse | null>(null);
  const [progress, setProgress] = useState<CurrentLevelProgressResponse | null>(null);
  const [decompositionWorkspace, setDecompositionWorkspace] = useState<DecompositionWorkspaceResponse | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [candidateDrafts, setCandidateDrafts] = useState<Record<string, string>>({});
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, ResolutionDraft>>({});

  async function loadPage(signal?: AbortSignal) {
    const [healthResponse, progressResponse, decompositionResponse] = await Promise.all([
      fetch(`${apiBaseUrl}${HEALTHCHECK_PATH}`, { signal }),
      fetch(`${apiBaseUrl}/levels/current`, { signal }),
      fetch(`${apiBaseUrl}/decompositions/workspace`, { signal })
    ]);

    if (!healthResponse.ok) {
      throw new Error(`Healthcheck failed with status ${healthResponse.status}`);
    }

    if (!progressResponse.ok) {
      throw new Error(`Current level failed with status ${progressResponse.status}`);
    }

    if (!decompositionResponse.ok) {
      throw new Error(`Decomposition workspace failed with status ${decompositionResponse.status}`);
    }

    const nextHealth = await healthResponse.json() as HealthcheckResponse;
    const nextProgress = await progressResponse.json() as CurrentLevelProgressResponse;
    const nextDecomposition = await decompositionResponse.json() as DecompositionWorkspaceResponse;

    setHealth(nextHealth);
    setProgress(nextProgress);
    setDecompositionWorkspace(nextDecomposition);
    setSelectedCharacterId((current) => {
      if (current && nextDecomposition.charactersNeedingApproval.some((entry) => entry.character.id === current)) {
        return current;
      }

      return nextDecomposition.charactersNeedingApproval[0]?.character.id ?? null;
    });
  }

  useEffect(() => {
    const controller = new AbortController();

    async function start() {
      try {
        await loadPage(controller.signal);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setPageError(error instanceof Error ? error.message : "Unknown startup error");
      }
    }

    void start();
    return () => controller.abort();
  }, []);

  const unresolvedByPartId = useMemo(() => {
    const entries = decompositionWorkspace?.unresolvedProps ?? [];
    return new Map(entries.map((item) => [item.partId, item]));
  }, [decompositionWorkspace]);

  const selectedWorkspace = decompositionWorkspace?.charactersNeedingApproval.find(
    (entry) => entry.character.id === selectedCharacterId
  ) ?? decompositionWorkspace?.charactersNeedingApproval[0] ?? null;

  async function refreshAfterAction(message: string) {
    await loadPage();
    setActionMessage(message);
    setPageError(null);
  }

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

      await refreshAfterAction(`${kind === "character" ? "Character" : "Word"} learned.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Unknown learning action error");
    } finally {
      setSubmittingKey(null);
    }
  }

  async function createCandidate(characterId: string) {
    const raw = candidateDrafts[characterId] ?? "";
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      setActionMessage("Enter one or more comma-separated parts before saving a candidate.");
      return;
    }

    setSubmittingKey(`candidate:${characterId}`);

    try {
      const response = await fetch(`${apiBaseUrl}/characters/${characterId}/decomposition-candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts,
          notes: "Created from the decomposition workspace"
        })
      });

      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? `Failed to create candidate (${response.status})`);
      }

      setCandidateDrafts((current) => ({ ...current, [characterId]: "" }));
      await refreshAfterAction("Decomposition candidate stored.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Unknown candidate action error");
    } finally {
      setSubmittingKey(null);
    }
  }

  function updateResolutionDraft(partId: string, literalText: string, existingPropId?: string) {
    return resolutionDrafts[partId] ?? createResolutionDraft(literalText, existingPropId);
  }

  function setResolutionDraft(partId: string, next: ResolutionDraft) {
    setResolutionDrafts((current) => ({
      ...current,
      [partId]: next
    }));
  }

  async function resolvePart(partId: string, literalText: string) {
    const unresolved = unresolvedByPartId.get(partId);
    const draft = updateResolutionDraft(partId, literalText, unresolved?.existingPropOptions[0]?.id);
    let payload: DecompositionPartResolutionInput;

    if (draft.action === "match_existing_prop") {
      if (!draft.propId) {
        setActionMessage("Choose an existing prop before matching this unresolved piece.");
        return;
      }

      payload = {
        action: "match_existing_prop",
        propId: draft.propId
      };
    } else if (draft.action === "create_known_character_prop") {
      payload = {
        action: "create_known_character_prop",
        name: draft.name,
        shapeRef: draft.shapeRef,
        meaningOrImage: draft.meaningOrImage,
        notes: draft.notes || null
      };
    } else {
      payload = {
        action: "create_new_prop",
        name: draft.name,
        shapeRef: draft.shapeRef || null,
        meaningOrImage: draft.meaningOrImage,
        notes: draft.notes || null
      };
    }

    setSubmittingKey(`part:${partId}`);

    try {
      const response = await fetch(`${apiBaseUrl}/decompositions/parts/${partId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorPayload = await response.json() as { error?: string };
        throw new Error(errorPayload.error ?? `Failed to resolve part (${response.status})`);
      }

      await refreshAfterAction(`Resolved ${literalText}.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Unknown part resolution error");
    } finally {
      setSubmittingKey(null);
    }
  }

  async function approveCandidate(candidateId: string) {
    setSubmittingKey(`approve:${candidateId}`);

    try {
      const response = await fetch(`${apiBaseUrl}/decompositions/candidates/${candidateId}/approve`, {
        method: "POST"
      });

      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? `Failed to approve candidate (${response.status})`);
      }

      await refreshAfterAction("Canonical decomposition approved.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Unknown approval error");
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
        <p className="eyebrow">Ticket 010</p>
        <h1>Decomposition Approval And Unresolved Props</h1>
        <p className="hero-copy">
          Approve candidate decompositions, resolve missing prop pieces inline, and unlock blocked characters in learning mode as soon as a canonical breakdown exists.
        </p>
        <div className="hero-status">
          <span>API: {health ? `${health.status} @ ${health.databasePath}` : pageError ?? "Loading..."}</span>
          <span>{progress ? `${progress.learnedCharacterCount} characters known` : "Loading character progress..."}</span>
          <span>{progress ? `${progress.learnedWordCount} words known` : "Loading word progress..."}</span>
          <span>{decompositionWorkspace ? `${decompositionWorkspace.unresolvedProps.length} unresolved parts` : "Loading decomposition queue..."}</span>
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
            <p className="hero-copy">Decomposition approval stays available for later imports, but the sample curriculum is fully learned.</p>
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
                <p className="section-kicker">Decomposition Queue</p>
                <h2>Blocked characters awaiting approval</h2>
              </div>
            </div>

            {decompositionWorkspace?.charactersNeedingApproval.length ? (
              <div className="approval-list">
                {decompositionWorkspace.charactersNeedingApproval.map((entry) => (
                  <button
                    className={`queue-card ${selectedWorkspace?.character.id === entry.character.id ? "selected" : ""}`}
                    key={entry.character.id}
                    onClick={() => setSelectedCharacterId(entry.character.id)}
                    type="button"
                  >
                    <strong>{entry.character.hanzi}</strong>
                    <span>{formatNullable(entry.character.pinyinDisplay)} / {formatNullable(entry.character.meaningPrimary)}</span>
                    <span>{entry.candidates.length} candidate{entry.candidates.length === 1 ? "" : "s"}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-state compact">No blocked decomposition approvals are waiting right now.</p>
            )}
          </article>

          <article className="panel panel-stack panel-span">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Approval Workspace</p>
                <h2>{selectedWorkspace ? `${selectedWorkspace.character.hanzi} decomposition` : "Select a blocked character"}</h2>
              </div>
            </div>

            {selectedWorkspace ? (
              <div className="workspace-stack">
                <section className="focus-card">
                  <div className="focus-header">
                    <strong>{selectedWorkspace.character.hanzi}</strong>
                    <span className={`status-pill ${selectedWorkspace.character.status}`}>{formatStatus(selectedWorkspace.character.status)}</span>
                  </div>
                  <p>{formatNullable(selectedWorkspace.character.pinyinDisplay)} / {formatNullable(selectedWorkspace.character.meaningPrimary)}</p>
                  <p className="helper-copy">
                    Linked words: {selectedWorkspace.linkedWords.map((word) => `${word.simplified} (${formatStatus(word.status)})`).join(", ") || "None"}
                  </p>
                  <div className="candidate-builder">
                    <input
                      onChange={(event) => setCandidateDrafts((current) => ({
                        ...current,
                        [selectedWorkspace.character.id]: event.target.value
                      }))}
                      placeholder="Add candidate parts, comma separated"
                      value={candidateDrafts[selectedWorkspace.character.id] ?? ""}
                    />
                    <button
                      className="secondary-button"
                      disabled={submittingKey === `candidate:${selectedWorkspace.character.id}`}
                      onClick={() => void createCandidate(selectedWorkspace.character.id)}
                      type="button"
                    >
                      {submittingKey === `candidate:${selectedWorkspace.character.id}` ? "Saving..." : "Store Candidate"}
                    </button>
                  </div>
                </section>

                <div className="study-list">
                  {selectedWorkspace.candidates.map((candidate) => (
                    <article className="study-card" key={candidate.id}>
                      <div className="focus-header">
                        <strong>Candidate</strong>
                        <button
                          className="primary-button"
                          disabled={submittingKey === `approve:${candidate.id}`}
                          onClick={() => void approveCandidate(candidate.id)}
                          type="button"
                        >
                          {submittingKey === `approve:${candidate.id}` ? "Saving..." : "Approve As Canonical"}
                        </button>
                      </div>
                      {candidate.notes ? <p className="helper-copy">{candidate.notes}</p> : null}
                      <div className="part-list">
                        {candidate.parts.map((part) => {
                          const unresolved = unresolvedByPartId.get(part.id);
                          const draft = updateResolutionDraft(part.id, part.text, unresolved?.existingPropOptions[0]?.id);

                          return (
                            <div className="part-card" key={part.id}>
                              <div className="focus-header">
                                <strong>{part.text}</strong>
                                <span className={`status-pill ${part.resolutionKind === "literal" ? "blocked" : "ready"}`}>
                                  {part.resolutionKind === "literal" ? "Unresolved" : `Resolved via ${part.resolutionKind}`}
                                </span>
                              </div>

                              {part.resolutionKind === "literal" && unresolved ? (
                                <div className="resolver-stack">
                                  <p className="helper-copy">
                                    Blocking: {unresolved.blockedDependencies.map((dependency) => `${dependency.text} (${dependency.kind})`).join(", ")}
                                  </p>
                                  <select
                                    onChange={(event) => setResolutionDraft(part.id, {
                                      ...draft,
                                      action: event.target.value as ResolutionMode
                                    })}
                                    value={draft.action}
                                  >
                                    <option value="match_existing_prop">Match existing prop</option>
                                    <option value="create_known_character_prop">Create prop already known to me</option>
                                    <option value="create_new_prop">Create genuinely new prop</option>
                                  </select>

                                  {draft.action === "match_existing_prop" ? (
                                    <select
                                      onChange={(event) => setResolutionDraft(part.id, {
                                        ...draft,
                                        propId: event.target.value
                                      })}
                                      value={draft.propId}
                                    >
                                      <option value="">Choose a prop</option>
                                      {unresolved.existingPropOptions.map((option) => (
                                        <option key={option.id} value={option.id}>
                                          {option.name} ({option.shapeRef ?? "no shape"})
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <div className="field-grid">
                                      <input
                                        onChange={(event) => setResolutionDraft(part.id, {
                                          ...draft,
                                          name: event.target.value
                                        })}
                                        placeholder="Prop name"
                                        value={draft.name}
                                      />
                                      <input
                                        onChange={(event) => setResolutionDraft(part.id, {
                                          ...draft,
                                          shapeRef: event.target.value
                                        })}
                                        placeholder="Shape reference"
                                        value={draft.shapeRef}
                                      />
                                      <input
                                        onChange={(event) => setResolutionDraft(part.id, {
                                          ...draft,
                                          meaningOrImage: event.target.value
                                        })}
                                        placeholder="Meaning or image"
                                        value={draft.meaningOrImage}
                                      />
                                      <input
                                        onChange={(event) => setResolutionDraft(part.id, {
                                          ...draft,
                                          notes: event.target.value
                                        })}
                                        placeholder="Notes"
                                        value={draft.notes}
                                      />
                                    </div>
                                  )}

                                  <button
                                    className="secondary-button"
                                    disabled={submittingKey === `part:${part.id}`}
                                    onClick={() => void resolvePart(part.id, part.text)}
                                    type="button"
                                  >
                                    {submittingKey === `part:${part.id}` ? "Saving..." : "Resolve Part"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p className="empty-state">The unresolved-prop queue is empty. New blocked characters will appear here once candidates are stored.</p>
            )}
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
