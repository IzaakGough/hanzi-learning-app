# Product Spec

## Goal

Build a single-user, local-first app for learning simplified Mandarin characters and words with:

- imported known characters and words from Pleco
- imported Mandarin Blueprint levels and OCLO ordering
- personalized prop-based character decomposition workflow
- learning mode
- review mode with spaced repetition
- sentence banks for words

## Source Of Truth

The app is the source of truth.

Pleco is an import/bootstrap source only in v1.

## Core Principles

- Simplified Chinese only
- Mandarin pinyin only
- Single user only
- Offline-capable study
- Static stored lexical data for studied items
- Manual approval for decomposition and generated sentence content

## Main Entities

- `character`
- `word`
- `level`
- `prop`
- `pinyin_mapping`
- `sentence`
- `review_state`

Characters and words are separate linked entities.

## Learning Mode

- Levels come from imported curriculum data
- Character introduction order is authoritative imported OCLO order
- Words unlock only when all component characters are already known or learned in the current level
- Pressing `learned`:
  - adds item to known set
  - makes item immediately eligible for review
- A level is complete only when all level characters and words are marked learned

## Review Mode

- Separate review queues for characters and words
- Shared FSRS scheduler underneath
- Recognition-only review cards in v1
- 4 review grades:
  - `again`
  - `hard`
  - `good`
  - `easy`

## Character Learning Requirements

A character must have:

- hanzi
- pinyin
- pinyin split
- primary meaning
- approved decomposition

before it is learnable.

## Word Learning Requirements

A word must have:

- simplified text
- pinyin
- primary meaning

before it is learnable.

Sentences and audio are optional enrichment.

## Props And Decomposition

- Props are personal mnemonic building blocks
- A prop may be:
  - a reusable component
  - a previously known full character reused as a component
- Decomposition is suggestion-plus-approval only
- External structural decomposition data is a suggestion source
- Approved decomposition is authoritative for study
- Unmatched pieces are treated as `unresolved`, not automatically as genuinely new props

## Sentence Banks

- Sentences support words; they are not SRS items
- Sentences may be linked to multiple words
- Generated sentences require manual approval in v1
- Manual sentences are auto-approved
- Sentence annotations use word-first matching against the current known-word set

## Imports

### Pleco

- `Characters` category defines known characters
- `Words` category defines known words
- Pleco lexical values are preferred for Pleco-imported known items

### Curriculum

- Notion-exported level data is imported via normalized files
- Missing lexical data is enriched during import

## Storage And Platform

- React frontend
- Node/TypeScript backend
- SQLite database
- Local-first web app
- Study workflows must work offline after content is imported/generated

## v1 Admin/Support Views

- search
- character detail view
- word detail view
- prop management
- pinyin mapping admin
- content queue
- soft archive support
- backup/export
