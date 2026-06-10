# 007 Search And Detail Views

## Goal

Expose imported and enriched data for inspection via search and item detail views.

## Dependencies

- `004-import-pipeline`
- `006-lexical-enrichment`

## Deliverables

- global search UI/API
- character detail page
- word detail page

## Requirements

- search characters by hanzi, pinyin, meaning
- search words by text, pinyin, meaning
- character detail must show:
  - lexical data
  - status
  - source
  - linked words
- word detail must show:
  - lexical data
  - status
  - source
  - component characters

## Acceptance Criteria

- search returns usable results for imported fixtures
- detail pages load by id
- basic manual edits to lexical fields are supported with provenance

## Non-Goals

- sentence banks
- review summaries beyond placeholders if review is not implemented yet
