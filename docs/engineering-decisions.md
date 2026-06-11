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
