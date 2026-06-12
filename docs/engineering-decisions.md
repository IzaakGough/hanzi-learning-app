# Engineering Decisions

This document captures implementation intent that was discussed but not yet pinned down strongly enough in the product spec or ticket files.

## 1. Import Conflict Policy

Default rule for ticket `004` and nearby work:

- imports must not silently overwrite existing manually curated data
- repeated imports should be safe for local iteration
- duplicate rows inside a single normalized file should be treated as invalid input

Preferred behavior when a canonical item already exists:

- create the canonical record if it does not exist
- fill missing fields if the incoming import provides values and the stored record is blank
- do not overwrite non-blank stored values by default
- record provenance and include a conflict/warning entry when incoming non-blank values disagree with existing non-blank values

Hard error examples:

- duplicate `hanzi` entries inside one `known_characters` file
- duplicate `simplified` entries inside one `known_words` file
- duplicate `(course, sequenceNumber)` levels inside one levels import
- duplicate `(kind, symbol)` mappings with conflicting values inside one mappings import

Warning examples:

- a level references a character or word already introduced elsewhere
- incoming lexical fields disagree with existing lexical fields

## 2. ID Generation Strategy

Use generated opaque IDs, not content-derived IDs.

Recommended rule:

- use `crypto.randomUUID()` in the API for new rows
- do not derive IDs from `hanzi`, `simplified`, or level numbers

Reason:

- canonical text fields may later need correction
- opaque IDs are simpler and more stable
- uniqueness should live in database constraints, not in handcrafted ID formats

## 3. Import Interface Boundary

For the next ticket, support both:

- a service layer in the API that performs imports
- a lightweight CLI entry point for local development

Do not build UI import flows yet.

Reason:

- local iteration is much faster with a CLI
- later API endpoints can call the same import service
- avoids coupling ticket `004` to frontend work

## 4. Provenance Semantics

`source` on a canonical record means original creation source, not latest contributing source.

Use this split:

- `source`: origin of the canonical record creation
- `sourceRef`: origin-specific reference if available
- import log / conflict summary: later contributing sources and disagreements

Manual edits should become authoritative without rewriting the record's original `source`.

## 5. Placeholder Creation During Level Import

If a level references a character or word that does not yet exist, the importer should create a placeholder canonical record.

Rules:

- placeholder character:
  - `status = blocked`
  - `source = curriculum_import`
  - minimal populated field: `hanzi`
- placeholder word:
  - `status = blocked`
  - `source = curriculum_import`
  - minimal populated field: `simplified`

These placeholders are expected to be enriched later.

## 6. Level Association Rule

Use join tables as the authoritative level membership model:

- `level_characters`
- `level_words`

The `level_id` column on canonical `characters` and `words` should represent first introduction level only.

If an item already has a `level_id` and a later level import tries to introduce it again:

- preserve the original `level_id`
- create or keep the level join only if needed for inspection
- emit a warning because duplicate introduction is not normal curriculum behavior

## 7. Import Diagnostics Format

Use structured diagnostics, not plain strings.

Recommended shape:

```ts
interface ImportDiagnostic {
  severity: "warning" | "error";
  code: string;
  message: string;
  entityType?: "character" | "word" | "level" | "mapping" | "import";
  entityKey?: string;
  field?: string;
}
```

Persist import summaries as JSON so they can be surfaced later in UI/admin work.

## 8. Database Access Pattern

Use a simple split:

- `db/`: connection + migrations
- `services/`: business logic such as imports
- optional `repositories/`: only if query duplication starts becoming real

Do not introduce a heavy ORM or a large repository abstraction yet.

Preferred default for now:

- raw SQL through `better-sqlite3`
- small focused service modules

## 9. Fixture Policy

Keep two categories distinct:

- `data/imports/examples/`: human-readable example normalized files
- test fixtures added later: purpose-built fixtures for automated tests

Do not overload the example fixtures as the only test coverage strategy.

## 10. Dev Database Workflow

From this point onward:

- migrations should be append-only
- agents should avoid rewriting old migrations unless the project is still obviously pre-shared and the change is trivial
- add a dedicated reset workflow soon if ticket `004` or later needs it

Recommended upcoming script:

- `db:reset`:
  - remove local SQLite file
  - rerun migrations

Do not delete local DB files implicitly during ordinary build or import commands.

## 11. Testing Bar

Current minimum bar per ticket:

- `build` passes
- `typecheck` passes
- targeted command-level verification for the feature being added

For data-heavy tickets from `004` onward, prefer adding at least small executable verification scripts or unit tests when practical.

## 12. Fresh-Agent Rule

A fresh agent should read, in order:

1. `docs/tickets/<current-ticket>.md`
2. `docs/v1-architecture.md`
3. this file
4. current repo state

This document should only contain implementation-level clarifications, not product redesign.

## 13. Null Initial And Null Final Mapping Encoding

For pinyin mapping admin/import work:

- represent a zero-initial or zero-final row with `symbol = "null"`
- keep `mappedValue` as a normal required mnemonic value
- do not encode zero-initial or zero-final as SQL `NULL` in `pinyin_mappings.mapped_value`

Reason:

- the existing normalized example fixture already uses the string sentinel
- it keeps the mapping table shape simple for imports, admin CRUD, and future lookup logic

## 14. Lexical Provenance Columns

For ticket `006` and future lexical editing work:

- keep `source` / `sourceRef` as canonical record creation provenance only
- store lexical provenance separately on characters and words:
  - `pinyin_source`
  - `pinyin_source_ref`
  - `meaning_source`
  - `meaning_source_ref`
- when lexical data is filled from the local enrichment dictionary, use:
  - `derived` as the field source
  - the dictionary identifier as the field source ref

Reason:

- lexical fields can be enriched after record creation
- pinyin and meaning may be updated independently later
- this preserves the original record origin while keeping field-level provenance explicit

## 15. Zero Initial And Zero Final Character Encoding

For stored character pinyin splits:

- encode a zero initial or zero final with the string sentinel `"null"`
- do not store zero initials/finals as SQL `NULL` when the split is known

Reason:

- it aligns stored character splits with the pinyin mapping symbol contract
- it distinguishes `known empty part` from `split not yet resolved`

## 16. Example Approved Decomposition Seed Data

For ticket `008` and the repo example curriculum:

- allow a repo-local curated fixture of approved decompositions for the sample level characters
- seed those rows idempotently during import/enrichment so learning mode is usable before ticket `010`
- do not treat this as general auto-approval for imported decomposition data

Reason:

- ticket `008` requires approved decompositions for learnable characters
- ticket `010` owns the actual approval workflow and broader decomposition management
- the sample curriculum still needs contract-valid study data in the meantime

## 17. Example Candidate Decomposition Seed Data

For ticket `010` and the repo example curriculum:

- allow a repo-local curated fixture of candidate decompositions for blocked sample characters
- seed those rows idempotently during import/enrichment so the approval UI has real queue data
- keep the candidate fixture separate from the approved-decomposition fixture
- prefer leaving later sample characters blocked by `missing_approved_decomposition` until the user approves a candidate

Reason:

- ticket `010` needs a real approval workflow to exercise
- this keeps v1 aligned with the no-auto-approval rule
- it avoids introducing a broader structural-decomposition import pipeline before it has a ticket

## 18. Uncalibrated FSRS Seed State

For ticket `011` and the initial review engine:

- when a character or word becomes `learned`, create its review-state row immediately
- seed the row as uncalibrated:
  - `scheduler_type = fsrs`
  - `due_at = learned_at`
  - `stability = NULL`
  - `difficulty = NULL`
  - `last_reviewed_at = NULL`
  - `review_count = 0`
  - `lapse_count = 0`
- the first real review grade initializes stability and difficulty
- do not synthesize mature review history for imported known items

Reason:

- imported known items need to enter review without pretending they already have calibrated FSRS history
- later review UI work can treat `NULL` stability/difficulty as a first-review state explicitly

## 19. Dashboard Queue Summary Source

For ticket `013` and before ticket `015` introduces a fuller queue hub:

- the dashboard queue summary should stay lightweight
- expose only counts that can be derived from the existing decomposition workspace:
  - characters needing decomposition approval
  - unresolved decomposition parts needing prop resolution
- omit zero-count queue sections in the UI
- do not introduce a broader `/queue` aggregate contract yet

Reason:

- ticket `013` needs queue visibility without taking on ticket `015`
- the repo does not yet persist or surface all queue categories through a dedicated queue service
- decomposition approval work is already real, actionable queue data in the current implementation

## 20. Sentence Analysis Span Link Storage

For ticket `014` and future sentence-bank work:

- store sentence analysis links with two nullable foreign keys:
  - `linked_word_id`
  - `linked_character_id`
- word spans (`known_word`, `unknown_word`) must populate only `linked_word_id`
- fallback character spans must populate only `linked_character_id`
- punctuation spans must populate neither
- do not use a single polymorphic `linked_item_id` column in SQLite

Reason:

- SQLite cannot enforce polymorphic foreign keys cleanly
- this keeps stored sentence analysis referentially valid
- render-time visibility can still apply the documented word-first annotation rules

## 21. Queue Registry Sync Model

For ticket `015` and the shared content queue hub:

- add a persisted `queue_items` table as a lightweight registry
- keep queue item identity stable with a unique `dedupe_key`
- treat `queue_items` as a synced projection of canonical source tables, not as the source of truth for decomposition, sentence, audio, or lexical records
- store queue-specific display payload in `payload_json` so the hub can render heterogeneous queue types through one list contract
- mark rows `resolved` when the underlying source item no longer belongs in an open queue instead of deleting them immediately

Reason:

- decomposition, unresolved prop, sentence, audio, and lexical queue items point at different canonical tables
- a synced registry gives the dashboard and queue hub one reusable contract now without forcing polymorphic foreign keys into SQLite
- stable queue ids and dedupe keys make queue actions and future audit views simpler

## 22. Local Sentence Generation Fallback

For ticket `016` and until a real AI provider is wired:

- keep sentence generation behind a service abstraction
- create async sentence-generation jobs in SQLite and process them through a lightweight in-process worker
- use a deterministic repo-local fallback generator to create pending candidates for moderation
- keep generated candidates marked `pending` and `derived`

Reason:

- the architecture still wants AI-first generation eventually
- the current repo should not block ticket `016` on external model wiring
- the approval workflow and queue behavior are the primary contract for v1

## 23. Sentence Regeneration Semantics

For ticket `016` moderation actions:

- regenerating a pending sentence candidate should reject the current candidate first
- regeneration should create a fresh async generation job for the candidate's primary linked word
- approved sentence retrieval should return only `approved` sentences, never `pending` or `rejected`

Reason:

- regeneration should leave a clear moderation trail instead of mutating the old candidate in place
- the queue should surface only currently actionable pending candidates
- learning and detail views must never leak unapproved generated content

## 24. Manual Sentence Auto-Linking

For ticket `017` and the first manual sentence entry flow:

- manual sentence creation is anchored to a current word
- the submitted sentence text must include that current word's simplified text
- the API should auto-link any additional non-archived canonical words whose simplified text also appears in the sentence
- sentence analysis should then run against that full linked-word set so one stored sentence can appear in multiple word banks

Reason:

- this keeps the initial UI small while still satisfying shared sentence reuse across words
- it avoids a separate multi-select word-picker before the repo has a fuller detail/edit surface
- it preserves one canonical sentence record with many-to-many word links instead of duplicating manual entries per word

## 25. Local Sentence Audio Storage And Fallback Provider

For ticket `018` and until a real TTS backend is wired:

- keep sentence audio generation behind a thin provider interface
- store generated sentence audio as app-managed local media files under the API data directory
- persist `sentences.audio_path` as the served relative URL path under `/media`
- use a deterministic local waveform fallback provider for v1 verification and offline reuse

Reason:

- ticket `018` needs queue-backed audio generation and playback now without blocking on an external service
- serving local media through the API keeps the playback contract stable for the web app
- storing reusable files on disk satisfies the offline-cache requirement once audio has been generated

## 26. Custom Item Collection Semantics

For ticket `019` and the first custom character/word flows:

- store user-created extra items in the normal `characters` and `words` tables
- represent the `extra/custom` collection with:
  - `source = manual`
  - `source_ref = 'extra/custom'`
  - `level_id = NULL`
- when a custom word references a character that does not exist yet, create a placeholder manual character row in the same collection and link it through `word_characters`
- custom items must still use the normal status sync rules for readiness, blocking, learning, archive exclusion, and review eligibility

Reason:

- custom items should reuse the canonical item model instead of introducing parallel tables late in v1
- `level_id = NULL` keeps them outside numbered curriculum progression without hiding them from search, detail, archive, or review flows
- placeholder character creation lets users save a custom word before every component character has been fully curated

## 27. Explicit Review Reset Semantics

For ticket `019` and manual per-item review resets:

- allow review reset only for learned, non-archived items that already participate in review
- preserve the canonical item row and existing `review_events`
- reset only the active scheduler state row:
  - `due_at = reset timestamp`
  - `stability = NULL`
  - `difficulty = NULL`
  - `last_reviewed_at = NULL`
  - `review_count = 0`
  - `lapse_count = 0`

Reason:

- the user intent is to restart scheduling, not delete study history
- keeping old review events preserves auditability while making the item immediately due for a fresh first review

## 28. Backup Export Dataset Shapes

For ticket `020` and the first local backup/export tooling:

- export learned non-archived known items using the existing normalized import JSON contracts:
  - `known_characters`
  - `known_words`
- export props as a JSON admin snapshot that includes:
  - `name`
  - `type`
  - `shapeRef`
  - `meaningOrImage`
  - `notes`
  - `isActive`
- export approved decompositions as JSON with:
  - target `hanzi`
  - decomposition provenance
  - ordered parts with explicit `resolutionKind`
  - embedded prop metadata when a part resolves to a prop

Reason:

- known characters and words should stay directly reusable by the existing import pipeline
- props and approved decompositions do not yet have normalized import contracts, but still need inspectable portable exports
- embedding prop metadata keeps approved decomposition exports understandable outside the live database

## 29. Reset Workflow Scope

For ticket `020` and the explicit local reset command:

- `db:reset` must require an explicit confirmation flag
- reset deletes only app-managed local state in the current database directory:
  - the SQLite database file
  - SQLite WAL/SHM sidecars
  - generated media under the API data directory
- reset must not delete:
  - checked-in example imports
  - generated backup/export files under `data/exports`
- after deletion, reset reruns migrations to recreate a clean schema immediately

Reason:

- the reset flow should be scriptable but still hard to trigger accidentally
- clearing media with the database avoids orphaned local files from old sentence audio state
- preserving exports and checked-in fixtures makes reset safe for normal development iteration

## 30. Generated Lexical Dictionary Dataset

For the real lexical enrichment dictionary:

- replace the example-only lexical dictionary with a generated derived dataset based on CC-CEDICT
- do not treat the lexical dictionary as a normalized import payload in this pass
- do not add a dedicated dictionary SQLite table in this pass
- keep the existing enrichment architecture: load the local dataset, enrich blank fields, persist onto canonical rows

Dataset placement:

- store the generated runtime artifact under `data/dictionaries/`
- do not keep the real maintained dictionary under `data/imports/examples/`

Generator implementation:

- implement the generator in the repo's existing Node `mjs` script style
- do not depend on a third-party parser script at runtime
- deterministic output is a hard requirement

Data-shape rules for the generated dictionary:

- keep the current enrichment contract:
  - `sourceName`
  - `characters[]`
  - `words[]`
- each entry should expose exactly one chosen:
  - `text`
  - `pinyinDisplay`
  - `meaningPrimary`
- use a derived provenance name such as `cc_cedict_generated_v1`

Selection rules:

- characters should be built only from true single-character dictionary entries
- words should be built from word entries
- choose one deterministic primary reading/meaning per simplified text
- do not attempt curriculum-aware disambiguation in this pass

Pinyin rules:

- normalize upstream pinyin into the repo's numbered format during generation
- keep numbered pinyin as the canonical stored format for now
- if an entry cannot be converted cleanly, omit it from the runtime artifact and record it in the generation report

Meaning rules:

- apply light heuristic cleaning only
- prefer a usable primary gloss over classifier-only or obvious variant/see-also senses when possible
- do not expand this pass into deep lexicographic cleanup

Reporting:

- generate a persisted dictionary report alongside the runtime artifact
- break omissions and suspicious cases down by reason
- use the report for visibility rather than blocking generation
