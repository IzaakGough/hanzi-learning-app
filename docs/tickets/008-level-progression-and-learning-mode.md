# 008 Level Progression And Learning Mode

## Goal

Implement the first usable learning workflow using imported levels and enriched data.

## Dependencies

- `004-import-pipeline`
- `005-mapping-admin-and-props`
- `006-lexical-enrichment`
- `007-search-and-detail-views`

## Deliverables

- current level progression service
- learning mode UI
- `mark learned` actions
- word unlock logic

## Requirements

- character introduction order must follow imported level order
- a character is learnable only when essential fields exist:
  - hanzi
  - pinyin
  - pinyin split
  - primary meaning
  - approved decomposition
- a word is learnable only when:
  - all component characters are already known or learned in current level
  - text, pinyin, and primary meaning exist
- marking learned should immediately:
  - add item to known set
  - persist learned timestamp

## Acceptance Criteria

- current level can be loaded in browser
- next character to learn is computed correctly
- newly eligible words unlock after learning required characters
- level completion is based on all characters and words being learned
- due-review logic is not required in this ticket

## Non-Goals

- FSRS review
- sentence generation
- audio generation
