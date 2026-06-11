Status: todo

# 010 Decomposition Approval And Unresolved Props

## Goal

Implement the decomposition approval workflow and unresolved-prop handling required to make new characters learnable.

## Dependencies

- `005-mapping-admin-and-props`
- `006-lexical-enrichment`
- `008-level-progression-and-learning-mode`

## Deliverables

- decomposition candidate storage and retrieval
- decomposition approval UI and API
- unresolved props queue
- dependency visibility from unresolved props to blocked characters/words

## Requirements

- no decomposition may be auto-approved in v1
- one approved decomposition becomes canonical for study
- unresolved pieces must support three outcomes:
  - match to existing prop
  - create prop already known to me
  - create genuinely new prop
- blocked characters must remain unlearnable until approved decomposition exists

## Acceptance Criteria

- a character can display one or more candidate decompositions
- user can approve one candidate and store it as canonical
- unresolved pieces can be created or matched inline
- blocked dependency information is visible for unresolved props
- learning mode updates character readiness once decomposition is approved

## Non-Goals

- AI generation of candidates if no structural suggestion source exists yet
- bulk auto-approval
