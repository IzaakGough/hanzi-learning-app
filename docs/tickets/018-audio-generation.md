Status: todo

# 018 Audio Generation

## Goal

Generate and cache audio for approved sentences without blocking sentence usability.

## Dependencies

- `016-sentence-generation-and-approval`
- `017-manual-sentence-entry-and-sentence-bank`

## Deliverables

- audio status fields and any needed migration updates
- provider abstraction for TTS generation
- queue-backed audio generation flow
- sentence audio playback integration

## Requirements

- audio generation should trigger only after sentence approval
- missing audio must not block sentence usage
- statuses must support `pending`, `ready`, and `failed`
- stored audio should be reusable offline once generated

## Acceptance Criteria

- approving a sentence can queue audio generation
- sentence records reflect audio status transitions
- ready audio can be played from the app
- failed audio jobs appear in the queue hub

## Non-Goals

- mandatory audio for study readiness
- multi-provider orchestration beyond a thin interface
