Status: done

# 016 Sentence Generation And Approval

## Goal

Generate sentence candidates for words and allow manual approval before they appear in learning/detail views.

## Dependencies

- `014-sentence-schema-and-analysis`
- `015-content-queue-hub`

## Deliverables

- sentence generation service abstraction
- queue-backed candidate generation flow
- sentence approval UI/actions

## Requirements

- generated sentences must never appear in learning mode before approval
- sentence generation should be asynchronous
- approved sentences must be linked to the relevant word(s)
- words remain learnable even if no approved sentences exist

## Acceptance Criteria

- generation jobs can create pending sentence candidates for words
- candidates appear in the sentence/content queue
- user can approve, reject, edit-then-approve, or regenerate
- approved sentences become visible through word-linked sentence retrieval

## Non-Goals

- audio generation
- automatic approval of generated sentences
