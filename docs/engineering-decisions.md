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
