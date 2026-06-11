Status: done

# 021 V1 Validation And Polish

## Goal

Harden the app enough that the full V1 workflow is coherent, diagnosable, and stable for regular local use.

## Dependencies

- all earlier V1 tickets

## Deliverables

- validation gap fixes
- import and content diagnostics cleanup
- UX polish for blockers and missing-data states
- final verification checklist for V1 readiness

## Requirements

- detect and surface invalid or duplicate curriculum data clearly
- ensure blocked reasons are visible and actionable
- ensure the dashboard, queue, learning, review, and sentence flows connect coherently
- close the major rough edges that would stop normal daily use

## Acceptance Criteria

- end-to-end bootstrap from normalized data works
- learning mode, review mode, sentence bank, and audio all function together
- major blocker states are visible and understandable
- final docs accurately reflect the repo and ticket state

## Non-Goals

- major product redesign
- speculative post-V1 features
