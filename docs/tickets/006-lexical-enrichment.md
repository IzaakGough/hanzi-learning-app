Status: todo

# 006 Lexical Enrichment

## Goal

Enrich curriculum-imported characters and words with pinyin, pinyin split, and meanings.

## Dependencies

- `002-schema-and-shared-types`
- `004-import-pipeline`
- `005-mapping-admin-and-props`

## Deliverables

- lexical enrichment service
- database updates for enriched fields
- unresolved-item diagnostics

## Requirements

- dictionary-first enrichment
- enrich only items missing lexical data
- preserve Pleco-provided lexical values for Pleco-imported known items
- unresolved items should be marked with a blocking reason

## Acceptance Criteria

- imported curriculum items gain stored pinyin and primary meanings
- pinyin is split into initial/final/tone
- missing lexical data is surfaced clearly
- enriched records retain provenance

## Non-Goals

- sentence generation
- audio
- live external service dependency at study time

