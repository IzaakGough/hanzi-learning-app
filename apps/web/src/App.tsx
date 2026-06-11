import { useEffect, useState, type FormEvent } from "react";
import {
  HEALTHCHECK_PATH,
  type CharacterDetailRecord,
  type HealthcheckResponse,
  type LexicalEditInputPayload,
  type SearchItemKind,
  type SearchResultItem,
  type WordDetailRecord
} from "@hanzi-learning-app/shared";

const apiBaseUrl = "http://localhost:3001";
const initialQuery = "学";

type SelectedItem = {
  id: string;
  kind: SearchItemKind;
};

const emptyEditForm: LexicalEditInputPayload = {
  pinyinDisplay: null,
  meaningPrimary: null,
  provenanceNote: ""
};

function formatNullable(value: string | null) {
  return value ?? "Not set";
}

export function App() {
  const [health, setHealth] = useState<HealthcheckResponse | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [resultsMessage, setResultsMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);

  const [characterDetail, setCharacterDetail] = useState<CharacterDetailRecord | null>(null);
  const [wordDetail, setWordDetail] = useState<WordDetailRecord | null>(null);
  const [editForm, setEditForm] = useState<LexicalEditInputPayload>(emptyEditForm);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPage() {
      try {
        const response = await fetch(`${apiBaseUrl}${HEALTHCHECK_PATH}`, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Healthcheck failed with status ${response.status}`);
        }

        const payload = await response.json() as HealthcheckResponse;
        setHealth(payload);
        await runSearch(initialQuery, null, controller.signal);
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

  function syncEditForm(detail: CharacterDetailRecord | WordDetailRecord) {
    setEditForm({
      pinyinDisplay: detail.pinyinDisplay,
      meaningPrimary: detail.meaningPrimary,
      provenanceNote: ""
    });
    setSaveMessage(null);
  }

  async function loadDetail(item: SelectedItem, signal?: AbortSignal) {
    const response = await fetch(`${apiBaseUrl}/${item.kind === "character" ? "characters" : "words"}/${item.id}`, {
      signal
    });

    if (!response.ok) {
      const payload = await response.json() as { error?: string };
      throw new Error(payload.error ?? `Failed to load detail (${response.status})`);
    }

    if (item.kind === "character") {
      const detail = await response.json() as CharacterDetailRecord;
      setCharacterDetail(detail);
      setWordDetail(null);
      syncEditForm(detail);
      return;
    }

    const detail = await response.json() as WordDetailRecord;
    setWordDetail(detail);
    setCharacterDetail(null);
    syncEditForm(detail);
  }

  async function runSearch(nextQuery: string, preferredSelection: SelectedItem | null, signal?: AbortSignal) {
    const trimmed = nextQuery.trim();

    setResultsMessage(trimmed.length === 0 ? "Enter hanzi, pinyin, or a meaning." : "Searching...");

    if (trimmed.length === 0) {
      setResults([]);
      setSelectedItem(null);
      setCharacterDetail(null);
      setWordDetail(null);
      setResultsMessage("Enter hanzi, pinyin, or a meaning.");
      return;
    }

    const response = await fetch(`${apiBaseUrl}/search?${new URLSearchParams({ q: trimmed }).toString()}`, {
      signal
    });

    if (!response.ok) {
      throw new Error(`Failed to search (${response.status})`);
    }

    const payload = await response.json() as { items: SearchResultItem[] };
    setResults(payload.items);

    if (payload.items.length === 0) {
      setSelectedItem(null);
      setCharacterDetail(null);
      setWordDetail(null);
      setResultsMessage("No matches for that search.");
      return;
    }

    const nextSelected = preferredSelection
      ? payload.items.find((item) => item.id === preferredSelection.id && item.kind === preferredSelection.kind)
      : payload.items[0];

    const selected = nextSelected ?? payload.items[0];
    setSelectedItem({ id: selected.id, kind: selected.kind });
    setResultsMessage(`${payload.items.length} result${payload.items.length === 1 ? "" : "s"}`);
    await loadDetail({ id: selected.id, kind: selected.kind }, signal);
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await runSearch(query, selectedItem);
    } catch (error) {
      setResultsMessage(error instanceof Error ? error.message : "Unknown search error");
    }
  }

  async function selectResult(item: SelectedItem) {
    setSelectedItem(item);

    try {
      await loadDetail(item);
    } catch (error) {
      setResultsMessage(error instanceof Error ? error.message : "Unknown detail error");
    }
  }

  async function saveLexicalEdits() {
    if (!selectedItem) {
      return;
    }

    setSaveMessage("Saving...");

    try {
      const response = await fetch(
        `${apiBaseUrl}/${selectedItem.kind === "character" ? "characters" : "words"}/${selectedItem.id}/lexical`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editForm)
        }
      );

      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? `Failed to save lexical edits (${response.status})`);
      }

      if (selectedItem.kind === "character") {
        const detail = await response.json() as CharacterDetailRecord;
        setCharacterDetail(detail);
        setWordDetail(null);
        syncEditForm(detail);
      } else {
        const detail = await response.json() as WordDetailRecord;
        setWordDetail(detail);
        setCharacterDetail(null);
        syncEditForm(detail);
      }

      await runSearch(query, selectedItem);
      setSaveMessage("Lexical fields updated.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Unknown save error");
    }
  }

  const activeDetail = characterDetail ?? wordDetail;

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Ticket 007</p>
        <h1>Search And Detail Views</h1>
        <p className="hero-copy">
          Search imported fixtures by hanzi, pinyin, or meaning, inspect linked records, and make manual lexical edits with explicit provenance.
        </p>
        <div className="hero-status">
          <span>API: {health ? `${health.status} @ ${health.databasePath}` : pageError ?? "Loading..."}</span>
          <span>{results.length} visible result{results.length === 1 ? "" : "s"}</span>
          <span>{activeDetail ? `Viewing ${selectedItem?.kind}` : "No item selected"}</span>
        </div>
      </section>

      <section className="workspace search-layout">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Global Search</p>
              <h2>Characters and words</h2>
            </div>
          </div>

          <form className="search-bar" onSubmit={(event) => void submitSearch(event)}>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try 学, ni3, or student"
              value={query}
            />
            <button className="primary-button" type="submit">Search</button>
          </form>

          <p className="form-message left">{resultsMessage ?? " "}</p>

          <div className="result-list">
            {results.length === 0 ? (
              <p className="empty-state">No searchable items loaded yet.</p>
            ) : (
              results.map((item) => (
                <button
                  className={item.id === selectedItem?.id && item.kind === selectedItem.kind ? "list-item active" : "list-item"}
                  key={`${item.kind}:${item.id}`}
                  onClick={() => void selectResult({ id: item.id, kind: item.kind })}
                  type="button"
                >
                  <div className="result-meta">
                    <span>{item.kind}</span>
                    <span>{item.status}</span>
                  </div>
                  <strong>{item.text}</strong>
                  <small>{item.pinyinDisplay ?? "No pinyin"} · {item.meaningPrimary ?? "No meaning"}</small>
                </button>
              ))
            )}
          </div>
        </article>

        <article className="panel detail-panel">
          {!activeDetail || !selectedItem ? (
            <p className="empty-state">Select a search result to inspect it.</p>
          ) : (
            <>
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">{selectedItem.kind === "character" ? "Character Detail" : "Word Detail"}</p>
                  <h2>{selectedItem.kind === "character" ? characterDetail?.hanzi : wordDetail?.simplified}</h2>
                </div>
              </div>

              <div className="detail-grid">
                <section className="detail-section">
                  <h3>Lexical Data</h3>
                  <dl className="detail-list">
                    <div><dt>Pinyin</dt><dd>{formatNullable(activeDetail.pinyinDisplay)}</dd></div>
                    {selectedItem.kind === "character" ? (
                      <>
                        <div><dt>Initial</dt><dd>{formatNullable(characterDetail?.pinyinInitial ?? null)}</dd></div>
                        <div><dt>Final</dt><dd>{formatNullable(characterDetail?.pinyinFinal ?? null)}</dd></div>
                        <div><dt>Tone</dt><dd>{formatNullable(characterDetail?.tone ?? null)}</dd></div>
                      </>
                    ) : null}
                    <div><dt>Meaning</dt><dd>{formatNullable(activeDetail.meaningPrimary)}</dd></div>
                    <div><dt>Pinyin Source</dt><dd>{formatNullable(activeDetail.pinyinSource)}</dd></div>
                    <div><dt>Pinyin Source Ref</dt><dd>{formatNullable(activeDetail.pinyinSourceRef)}</dd></div>
                    <div><dt>Meaning Source</dt><dd>{formatNullable(activeDetail.meaningSource)}</dd></div>
                    <div><dt>Meaning Source Ref</dt><dd>{formatNullable(activeDetail.meaningSourceRef)}</dd></div>
                  </dl>
                </section>

                <section className="detail-section">
                  <h3>Status And Source</h3>
                  <dl className="detail-list">
                    <div><dt>Status</dt><dd>{activeDetail.status}</dd></div>
                    <div><dt>Blocked Reason</dt><dd>{formatNullable(activeDetail.blockedReason)}</dd></div>
                    <div><dt>Source</dt><dd>{activeDetail.source}</dd></div>
                    <div><dt>Source Ref</dt><dd>{formatNullable(activeDetail.sourceRef)}</dd></div>
                    <div><dt>Level Id</dt><dd>{formatNullable(activeDetail.levelId)}</dd></div>
                    <div><dt>Notes</dt><dd>{formatNullable(activeDetail.notes)}</dd></div>
                  </dl>
                </section>

                <section className="detail-section">
                  <h3>{selectedItem.kind === "character" ? "Linked Words" : "Component Characters"}</h3>
                  <div className="related-list">
                    {selectedItem.kind === "character" ? (
                      characterDetail?.linkedWords.length ? characterDetail.linkedWords.map((word) => (
                        <button
                          className="related-item"
                          key={word.id}
                          onClick={() => void selectResult({ id: word.id, kind: "word" })}
                          type="button"
                        >
                          <strong>{word.simplified}</strong>
                          <small>{word.pinyinDisplay ?? "No pinyin"} · {word.meaningPrimary ?? "No meaning"} · {word.status}</small>
                        </button>
                      )) : <p className="empty-state compact">No linked words for this character yet.</p>
                    ) : (
                      wordDetail?.componentCharacters.length ? wordDetail.componentCharacters.map((character) => (
                        <button
                          className="related-item"
                          key={character.id}
                          onClick={() => void selectResult({ id: character.id, kind: "character" })}
                          type="button"
                        >
                          <strong>{character.hanzi}</strong>
                          <small>{character.pinyinDisplay ?? "No pinyin"} · {character.meaningPrimary ?? "No meaning"} · {character.status}</small>
                        </button>
                      )) : <p className="empty-state compact">No component characters linked yet.</p>
                    )}
                  </div>
                </section>

                <section className="detail-section">
                  <h3>Manual Lexical Edit</h3>
                  <div className="form-column">
                    <label>
                      <span>Pinyin Display</span>
                      <input
                        onChange={(event) => setEditForm((current) => ({
                          ...current,
                          pinyinDisplay: event.target.value.trim().length > 0 ? event.target.value : null
                        }))}
                        placeholder={selectedItem.kind === "character" ? "ni3" : "ni3 hao3"}
                        value={editForm.pinyinDisplay ?? ""}
                      />
                    </label>

                    <label>
                      <span>Meaning</span>
                      <textarea
                        onChange={(event) => setEditForm((current) => ({
                          ...current,
                          meaningPrimary: event.target.value.trim().length > 0 ? event.target.value : null
                        }))}
                        rows={3}
                        value={editForm.meaningPrimary ?? ""}
                      />
                    </label>

                    <label>
                      <span>Provenance Note</span>
                      <textarea
                        onChange={(event) => setEditForm((current) => ({
                          ...current,
                          provenanceNote: event.target.value
                        }))}
                        placeholder="Explain the manual source for this edit"
                        rows={3}
                        value={editForm.provenanceNote}
                      />
                    </label>

                    <div className="form-actions">
                      <button className="primary-button" onClick={() => void saveLexicalEdits()} type="button">
                        Save Lexical Fields
                      </button>
                      <p className="form-message">{saveMessage ?? " "}</p>
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}
        </article>
      </section>
    </main>
  );
}
