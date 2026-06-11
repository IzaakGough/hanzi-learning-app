Status: done

# 017 Manual Sentence Entry And Sentence Bank

## Goal

Support manually entered sentences and expose sentence banks on word detail/learning views.

## Dependencies

- `014-sentence-schema-and-analysis`
- `016-sentence-generation-and-approval`

## Deliverables

- manual sentence entry flow
- sentence bank UI on word detail and/or learning views
- sentence linking to one or more words

## Requirements

- manual sentences are auto-approved
- manual sentences still pass through the same tokenization/analysis pipeline
- sentence banks should show sentences even when audio is missing
- sentence banks must support shared sentence reuse across words

## Acceptance Criteria

- user can add a sentence manually to a word
- the sentence is stored, analyzed, and visible immediately
- word views can list approved sentence-bank entries
- a sentence can be linked to more than one word

## Non-Goals

- sentence SRS
- advanced sentence sorting heuristics
