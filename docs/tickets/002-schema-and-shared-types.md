Status: done

# 002 Schema And Shared Types

## Goal

Establish the initial SQLite schema and shared enum/type contracts.

## Dependencies

- `001-project-scaffold`

## Deliverables

- migration system setup
- initial migration creating core tables
- shared enums/types in `packages/shared`

## Required Tables

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
- `imports`

## Required Shared Enums

- `ItemStatus`
- `ItemSource`
- `QueueItemType`
- `SentenceApprovalStatus`
- `AudioStatus`

## Acceptance Criteria

- migrations can be applied from a clean database
- database file is created locally
- shared enums are imported by both web and api without duplication
- schema follows `docs/v1-architecture.md`

## Non-Goals

- FSRS review tables can wait if they complicate the first migration
- sentence tables can be included now or in the next migration if cleaner

