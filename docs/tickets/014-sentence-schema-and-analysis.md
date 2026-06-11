Status: done

# 014 Sentence Schema And Analysis

## Goal

Add the persistent sentence model and analysis storage needed for sentence banks and known/unknown annotation.

## Dependencies

- `002-schema-and-shared-types`
- `006-lexical-enrichment`

## Deliverables

- sentence tables and migrations
- sentence-word link model
- stored sentence analysis spans
- service methods for recomputing display visibility against current known sets

## Requirements

- sentences are supporting content, not SRS items
- one sentence may link to multiple words
- tokenization/analysis structure must be stored
- display logic should recompute known/unknown visibility at render time
- word-first annotation rules must be preserved

## Acceptance Criteria

- schema supports canonical sentence records and many-to-many word links
- sentence analysis spans can be stored and read back
- known/unknown visibility can be recomputed using current known-word and known-character sets

## Non-Goals

- generation UI
- audio generation
