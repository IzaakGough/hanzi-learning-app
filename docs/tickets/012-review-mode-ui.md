Status: done

# 012 Review Mode UI

## Goal

Build recognition-only review flows for characters and words on top of the review engine.

## Dependencies

- `011-fsrs-review-engine`
- `007-search-and-detail-views`

## Deliverables

- character review screen
- word review screen
- reveal-and-grade interaction
- due counts and session progression

## Requirements

- character prompt shows character only
- word prompt shows Chinese word only
- reveal must show the stored answer data
- user can grade with the 4 supported FSRS grades
- character and word review flows remain separate in v1

## Acceptance Criteria

- due character items can be reviewed end-to-end
- due word items can be reviewed end-to-end
- grading updates scheduler state correctly
- review flow uses stored lexical/decomposition data, not regenerated content

## Non-Goals

- production cards
- handwriting input
- combined cross-type session UI unless trivial
