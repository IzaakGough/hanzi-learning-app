Status: todo

# 019 Custom Items, Archive, And Review Reset

## Goal

Support custom characters/words outside the curriculum, soft archive flows, and explicit review reset actions.

## Dependencies

- `008-level-progression-and-learning-mode`
- `012-review-mode-ui`
- `017-manual-sentence-entry-and-sentence-bank`

## Deliverables

- custom character and word creation flows
- `extra/custom` collection handling
- soft archive actions
- explicit review reset actions

## Requirements

- custom items must use the same gating rules as curriculum items where applicable
- custom words may be saved while blocked by unknown characters
- custom characters may be saved while blocked by missing decomposition approval
- archive must remove items from active flows without deleting history
- edits must not auto-reset review state
- reset review state must be explicit

## Acceptance Criteria

- user can create custom characters and words outside numbered levels
- blocked custom items become usable when prerequisites are satisfied
- archived items leave active learning/review flows but keep history
- review state can be reset manually on a per-item basis

## Non-Goals

- multi-user moderation
- hard delete workflows for normal usage
