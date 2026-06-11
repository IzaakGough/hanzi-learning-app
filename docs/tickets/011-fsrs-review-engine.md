Status: done

# 011 FSRS Review Engine

## Goal

Add the scheduler state and review event model needed for character and word SRS review.

## Dependencies

- `002-schema-and-shared-types`
- `008-level-progression-and-learning-mode`

## Deliverables

- review state tables and migrations
- FSRS scheduling service
- review event persistence
- queue queries for due character and word items

## Requirements

- separate review states for characters and words
- shared scheduler implementation underneath
- support grades:
  - `again`
  - `hard`
  - `good`
  - `easy`
- imported known items should be seedable as known but uncalibrated
- review state must be independent from level completion state

## Acceptance Criteria

- schema contains review state and review event storage
- learned items can become review-eligible
- due-item queries work separately for characters and words
- grading an item updates its scheduler state and logs an event
- imported known items can be initialized without fake mature history

## Non-Goals

- final review UI polish
- analytics beyond what the scheduler needs
