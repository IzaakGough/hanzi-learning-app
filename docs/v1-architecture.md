# V1 Architecture

## Scope

This document defines the technical contracts for the first implementation phases. Agents should follow this document instead of redefining the data model or project structure ticket-by-ticket.

## Stack

- Frontend: React + TypeScript + Vite
- Backend: Node.js + TypeScript
- API: REST over local HTTP
- Database: SQLite
- Migrations: SQL or TypeScript migration runner
- Package manager: npm

## Repo Structure

```text
/
  apps/
    web/
    api/
  packages/
    shared/
  docs/
    tickets/
  scripts/
  data/
    imports/
    exports/
```

## High-Level Architecture

- `apps/web` renders the local UI
- `apps/api` owns:
  - SQLite access
  - import pipeline
  - enrichment orchestration
  - queue/job execution
  - review scheduling
- `packages/shared` contains:
  - shared types
  - enums
  - validation schemas where useful

## Canonical Concepts

### Character

A writing unit with:

- simplified hanzi
- pinyin display
- pinyin split
- primary meaning
- approved decomposition
- level introduction metadata
- learning state
- review state

### Word

A lexical unit with:

- simplified text
- pinyin display
- primary meaning
- ordered component characters
- level introduction metadata
- learning state
- review state

### Prop

A personal mnemonic component. A prop can be:

- a reusable component
- a known character reused as a component

### Sentence

Supporting content linked to one or more words. Sentences are not review items in v1.

## Shared Enums

These enums must live in `packages/shared`.

### ItemStatus

- `blocked`
- `ready`
- `learned`
- `archived`

`due` should be treated as scheduler-derived state, not a stored top-level status.

### ItemSource

- `pleco_import`
- `curriculum_import`
- `manual`
- `derived`

### QueueItemType

- `decomposition_candidate`
- `unresolved_prop`
- `sentence_candidate`
- `audio_failure`
- `missing_lexical_data`

### SentenceApprovalStatus

- `pending`
- `approved`
- `rejected`

### AudioStatus

- `none`
- `pending`
- `ready`
- `failed`

## State Model

### Learning State

Stored on items:

- status
- blocked reason code, nullable
- learned timestamp, nullable
- archived timestamp, nullable

### Review State

Stored separately for characters and words:

- scheduler type: `fsrs`
- due at
- stability/difficulty params required by implementation
- last reviewed at
- review count
- lapse count

`learned` and `due` are separate concepts.

## Data Model Draft

### Tables

- `characters`
- `words`
- `word_characters`
- `levels`
- `level_characters`
- `level_words`
- `props`
- `character_decompositions`
- `character_decomposition_parts`
- `pinyin_mappings`
- `character_review_state`
- `word_review_state`
- `review_events`
- `sentences`
- `word_sentences`
- `sentence_analysis_spans`
- `imports`
- `queue_items`

### Character Fields

- `id`
- `hanzi`
- `pinyin_display`
- `pinyin_source`
- `pinyin_source_ref`
- `pinyin_initial`
- `pinyin_final`
- `tone`
- `meaning_primary`
- `meaning_source`
- `meaning_source_ref`
- `meanings_other_json`
- `status`
- `blocked_reason`
- `learned_at`
- `archived_at`
- `source`
- `source_ref`
- `level_id`
- `notes`
- timestamps

### Word Fields

- `id`
- `simplified`
- `pinyin_display`
- `pinyin_source`
- `pinyin_source_ref`
- `meaning_primary`
- `meaning_source`
- `meaning_source_ref`
- `meanings_other_json`
- `status`
- `blocked_reason`
- `learned_at`
- `archived_at`
- `source`
- `source_ref`
- `level_id`
- `notes`
- timestamps

### Prop Fields

- `id`
- `name`
- `type`
- `shape_ref`
- `meaning_or_image`
- `notes`
- `is_active`
- timestamps

### Pinyin Mapping Fields

- `id`
- `kind`
  - `initial`
  - `final`
  - `tone`
- `symbol`
- `mapped_value`
- `notes`

### Sentence Fields

- `id`
- `text`
- `translation`
- `pinyin_full`
- `approval_status`
- `audio_status`
- `audio_path`
- `generation_source`
- `notes`
- timestamps

## Import Contract

Raw external exports should be normalized before app import.

Expected normalized datasets:

- `known_characters.json` or `.csv`
- `known_words.json` or `.csv`
- `levels.json`
- `pinyin_mappings.json`

The app import pipeline should only target normalized formats in the first milestone.

## Enrichment Contract

### Lexical Enrichment

Used during curriculum import to fill missing:

- pinyin
- pinyin split
- primary meaning

Rules:

- dictionary-first
- unresolved items become `missing_lexical_data`
- Pleco values win for Pleco-imported known items

### Decomposition Suggestions

Used for new characters.

Rules:

- structural dataset first
- map against props + known character-props
- store 1-3 candidates
- never auto-approve in v1

### Sentence Generation

Rules:

- AI-first for candidate generation
- stored as pending approval
- never shown in learning mode before approval

## Sentence Analysis Model

Store stable analysis spans for sentence display.

Each span should include:

- `sentence_id`
- order index
- text
- span type:
  - `known_word`
  - `unknown_word`
  - `fallback_character`
  - `punctuation`
- linked item id, nullable
- gloss text, nullable
- pinyin text, nullable

Display logic may suppress pinyin/gloss for known items based on current knowledge state.

## API Boundaries

Initial API domains:

- `/imports`
- `/characters`
- `/words`
- `/levels`
- `/props`
- `/mappings`
- `/reviews`
- `/queue`
- `/sentences`
- `/search`

Agents should avoid inventing GraphQL or alternative transport in v1.

## Queue/Job Model

Queue items are persisted in SQLite.

Initial queue types:

- decomposition candidates
- unresolved props
- sentence candidates
- audio failures
- missing lexical data

The initial implementation can process jobs synchronously or via a simple worker loop. Do not introduce heavy infrastructure.

## Provenance Rules

Edits must preserve provenance:

- imported/generated value source
- manual overrides

Manual edits become authoritative and must not be silently overwritten by later enrichment.

## Non-Goals For Early Milestones

- multi-user auth
- cloud sync
- mobile/native wrappers
- traditional character support
- production card types
- sentence SRS
- full raw-export parsing inside the app
