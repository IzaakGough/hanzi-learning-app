import { useEffect, useState, type FormEvent } from "react";
import {
  HEALTHCHECK_PATH,
  type HealthcheckResponse,
  type MappingAdminInputPayload,
  type PinyinMappingRecord,
  type PropAdminInputPayload,
  type PropRecord
} from "@hanzi-learning-app/shared";

const apiBaseUrl = "http://localhost:3001";

const emptyMappingForm: MappingAdminInputPayload = {
  kind: "initial",
  symbol: "",
  mappedValue: "",
  notes: null
};

const emptyPropForm: PropAdminInputPayload = {
  name: "",
  type: "component",
  shapeRef: null,
  meaningOrImage: "",
  notes: null,
  isActive: true
};

export function App() {
  const [health, setHealth] = useState<HealthcheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mappings, setMappings] = useState<PinyinMappingRecord[]>([]);
  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(null);
  const [mappingForm, setMappingForm] = useState<MappingAdminInputPayload>(emptyMappingForm);
  const [mappingMessage, setMappingMessage] = useState<string | null>(null);

  const [props, setProps] = useState<PropRecord[]>([]);
  const [propSearch, setPropSearch] = useState("");
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [propForm, setPropForm] = useState<PropAdminInputPayload>(emptyPropForm);
  const [propMessage, setPropMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialData() {
      try {
        const [healthResponse, mappingsResponse, propsResponse] = await Promise.all([
          fetch(`${apiBaseUrl}${HEALTHCHECK_PATH}`, { signal: controller.signal }),
          fetch(`${apiBaseUrl}/mappings`, { signal: controller.signal }),
          fetch(`${apiBaseUrl}/props`, { signal: controller.signal })
        ]);

        if (!healthResponse.ok) {
          throw new Error(`Healthcheck failed with status ${healthResponse.status}`);
        }

        if (!mappingsResponse.ok) {
          throw new Error(`Failed to load mappings (${mappingsResponse.status})`);
        }

        if (!propsResponse.ok) {
          throw new Error(`Failed to load props (${propsResponse.status})`);
        }

        const healthData = await healthResponse.json() as HealthcheckResponse;
        const mappingsData = await mappingsResponse.json() as { items: PinyinMappingRecord[] };
        const propsData = await propsResponse.json() as { items: PropRecord[] };

        setHealth(healthData);
        setMappings(mappingsData.items);
        setProps(propsData.items);

        if (mappingsData.items.length > 0) {
          selectMapping(mappingsData.items[0]);
        }

        if (propsData.items.length > 0) {
          selectProp(propsData.items[0]);
        }
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
      }
    }

    void loadInitialData();

    return () => controller.abort();
  }, []);

  function selectMapping(mapping: PinyinMappingRecord) {
    setSelectedMappingId(mapping.id);
    setMappingForm({
      kind: mapping.kind,
      symbol: mapping.symbol,
      mappedValue: mapping.mappedValue,
      notes: mapping.notes
    });
    setMappingMessage(null);
  }

  function beginNewMapping() {
    setSelectedMappingId(null);
    setMappingForm(emptyMappingForm);
    setMappingMessage(null);
  }

  function selectProp(prop: PropRecord) {
    setSelectedPropId(prop.id);
    setPropForm({
      name: prop.name,
      type: prop.type,
      shapeRef: prop.shapeRef,
      meaningOrImage: prop.meaningOrImage,
      notes: prop.notes,
      isActive: prop.isActive === 1
    });
    setPropMessage(null);
  }

  function beginNewProp() {
    setSelectedPropId(null);
    setPropForm(emptyPropForm);
    setPropMessage(null);
  }

  async function reloadMappings(preferredId?: string | null) {
    const response = await fetch(`${apiBaseUrl}/mappings`);

    if (!response.ok) {
      throw new Error(`Failed to reload mappings (${response.status})`);
    }

    const data = await response.json() as { items: PinyinMappingRecord[] };
    setMappings(data.items);

    const nextSelected = preferredId
      ? data.items.find((item) => item.id === preferredId) ?? data.items[0]
      : data.items[0];

    if (nextSelected) {
      selectMapping(nextSelected);
      return;
    }

    beginNewMapping();
  }

  async function reloadProps(search: string, preferredId?: string | null) {
    const searchParams = new URLSearchParams();

    if (search.trim().length > 0) {
      searchParams.set("search", search.trim());
    }

    const url = searchParams.size > 0
      ? `${apiBaseUrl}/props?${searchParams.toString()}`
      : `${apiBaseUrl}/props`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to reload props (${response.status})`);
    }

    const data = await response.json() as { items: PropRecord[] };
    setProps(data.items);

    const nextSelected = preferredId
      ? data.items.find((item) => item.id === preferredId) ?? data.items[0]
      : data.items[0];

    if (nextSelected) {
      selectProp(nextSelected);
      return;
    }

    beginNewProp();
  }

  async function saveMapping() {
    setMappingMessage("Saving...");

    try {
      const response = await fetch(
        selectedMappingId ? `${apiBaseUrl}/mappings/${selectedMappingId}` : `${apiBaseUrl}/mappings`,
        {
          method: selectedMappingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mappingForm)
        }
      );

      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? `Failed to save mapping (${response.status})`);
      }

      const saved = await response.json() as PinyinMappingRecord;
      await reloadMappings(saved.id);
      setMappingMessage(selectedMappingId ? "Mapping updated." : "Mapping created.");
    } catch (saveError) {
      setMappingMessage(saveError instanceof Error ? saveError.message : "Unknown save error");
    }
  }

  async function saveProp() {
    setPropMessage("Saving...");

    try {
      const response = await fetch(
        selectedPropId ? `${apiBaseUrl}/props/${selectedPropId}` : `${apiBaseUrl}/props`,
        {
          method: selectedPropId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(propForm)
        }
      );

      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? `Failed to save prop (${response.status})`);
      }

      const saved = await response.json() as PropRecord;
      await reloadProps(propSearch, saved.id);
      setPropMessage(selectedPropId ? "Prop updated." : "Prop created.");
    } catch (saveError) {
      setPropMessage(saveError instanceof Error ? saveError.message : "Unknown save error");
    }
  }

  async function submitPropSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await reloadProps(propSearch, selectedPropId);
    } catch (searchError) {
      setPropMessage(searchError instanceof Error ? searchError.message : "Unknown search error");
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Ticket 005</p>
        <h1>Mapping Admin And Props</h1>
        <p className="hero-copy">
          Local admin tools for pinyin mappings and mnemonic props, served from the SQLite-backed API.
        </p>
        <div className="hero-status">
          <span>API: {health ? `${health.status} @ ${health.databasePath}` : error ?? "Loading..."}</span>
          <span>{mappings.length} mappings</span>
          <span>{props.length} props</span>
        </div>
      </section>

      <section className="workspace">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Mappings</p>
              <h2>Pinyin split controls</h2>
            </div>
            <button className="secondary-button" onClick={beginNewMapping} type="button">
              New Mapping
            </button>
          </div>

          <div className="panel-body">
            <div className="list-column">
              {mappings.length === 0 ? (
                <p className="empty-state">No mappings loaded yet.</p>
              ) : (
                mappings.map((mapping) => (
                  <button
                    className={mapping.id === selectedMappingId ? "list-item active" : "list-item"}
                    key={mapping.id}
                    onClick={() => selectMapping(mapping)}
                    type="button"
                  >
                    <span>{mapping.kind}</span>
                    <strong>{mapping.symbol}</strong>
                    <small>{mapping.mappedValue}</small>
                  </button>
                ))
              )}
            </div>

            <div className="form-column">
              <label>
                <span>Kind</span>
                <select
                  onChange={(event) => setMappingForm((current) => ({ ...current, kind: event.target.value as MappingAdminInputPayload["kind"] }))}
                  value={mappingForm.kind}
                >
                  <option value="initial">Initial</option>
                  <option value="final">Final</option>
                  <option value="tone">Tone</option>
                </select>
              </label>

              <label>
                <span>Symbol</span>
                <input
                  onChange={(event) => setMappingForm((current) => ({ ...current, symbol: event.target.value }))}
                  placeholder="zh"
                  value={mappingForm.symbol}
                />
              </label>

              <label>
                <span>Mapped Value</span>
                <input
                  onChange={(event) => setMappingForm((current) => ({ ...current, mappedValue: event.target.value }))}
                  placeholder={mappingForm.kind === "tone" ? "3" : "Null Actor"}
                  value={mappingForm.mappedValue}
                />
              </label>

              <p className="helper-copy">
                Use <code>null</code> as the symbol for zero-initial or zero-final rows.
              </p>

              <label>
                <span>Notes</span>
                <textarea
                  onChange={(event) => setMappingForm((current) => ({
                    ...current,
                    notes: event.target.value.trim().length > 0 ? event.target.value : null
                  }))}
                  placeholder="Optional context"
                  rows={4}
                  value={mappingForm.notes ?? ""}
                />
              </label>

              <div className="form-actions">
                <button className="primary-button" onClick={() => void saveMapping()} type="button">
                  {selectedMappingId ? "Save Mapping" : "Create Mapping"}
                </button>
                <p className="form-message">{mappingMessage ?? " "}</p>
              </div>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Props</p>
              <h2>Mnemonic component library</h2>
            </div>
            <button className="secondary-button" onClick={beginNewProp} type="button">
              New Prop
            </button>
          </div>

          <form className="search-bar" onSubmit={(event) => void submitPropSearch(event)}>
            <input
              onChange={(event) => setPropSearch(event.target.value)}
              placeholder="Search by name or meaning"
              value={propSearch}
            />
            <button className="secondary-button" type="submit">
              Search
            </button>
          </form>

          <div className="panel-body">
            <div className="list-column">
              {props.length === 0 ? (
                <p className="empty-state">No props match the current search.</p>
              ) : (
                props.map((prop) => (
                  <button
                    className={prop.id === selectedPropId ? "list-item active" : "list-item"}
                    key={prop.id}
                    onClick={() => selectProp(prop)}
                    type="button"
                  >
                    <span>{prop.type}</span>
                    <strong>{prop.name}</strong>
                    <small>{prop.meaningOrImage}</small>
                  </button>
                ))
              )}
            </div>

            <div className="form-column">
              <label>
                <span>Name</span>
                <input
                  onChange={(event) => setPropForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Sun"
                  value={propForm.name}
                />
              </label>

              <label>
                <span>Type</span>
                <select
                  onChange={(event) => setPropForm((current) => ({ ...current, type: event.target.value as PropAdminInputPayload["type"] }))}
                  value={propForm.type}
                >
                  <option value="component">Component</option>
                  <option value="known_character">Known Character</option>
                </select>
              </label>

              <label>
                <span>Shape Ref</span>
                <input
                  onChange={(event) => setPropForm((current) => ({
                    ...current,
                    shapeRef: event.target.value.trim().length > 0 ? event.target.value : null
                  }))}
                  placeholder="日"
                  value={propForm.shapeRef ?? ""}
                />
              </label>

              <label>
                <span>Meaning Or Image</span>
                <textarea
                  onChange={(event) => setPropForm((current) => ({ ...current, meaningOrImage: event.target.value }))}
                  placeholder="Bright sun over the horizon"
                  rows={4}
                  value={propForm.meaningOrImage}
                />
              </label>

              <label>
                <span>Notes</span>
                <textarea
                  onChange={(event) => setPropForm((current) => ({
                    ...current,
                    notes: event.target.value.trim().length > 0 ? event.target.value : null
                  }))}
                  placeholder="Optional usage notes"
                  rows={3}
                  value={propForm.notes ?? ""}
                />
              </label>

              <label className="checkbox-row">
                <input
                  checked={propForm.isActive}
                  onChange={(event) => setPropForm((current) => ({ ...current, isActive: event.target.checked }))}
                  type="checkbox"
                />
                <span>Prop is active</span>
              </label>

              <div className="form-actions">
                <button className="primary-button" onClick={() => void saveProp()} type="button">
                  {selectedPropId ? "Save Prop" : "Create Prop"}
                </button>
                <p className="form-message">{propMessage ?? " "}</p>
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
