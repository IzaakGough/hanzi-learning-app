Status: done

# 013 Dashboard And Priority Flow

## Goal

Create the home/dashboard workflow that prioritizes due review while still exposing current level progress and content queue work.

## Dependencies

- `008-level-progression-and-learning-mode`
- `012-review-mode-ui`

## Deliverables

- dashboard/home page
- due review summary
- current level summary
- quick links into review, learning, and queue work

## Requirements

- review should be visually prioritized but not hard-gated
- show current level and next character to introduce
- show unlocked words waiting in current level
- show content queue counts when queue work exists

## Acceptance Criteria

- dashboard renders due counts, current learning status, and queue counts
- user can start review or continue learning from the dashboard
- review backlog does not block access to learning mode

## Non-Goals

- advanced analytics
- streak systems beyond a minimal placeholder
