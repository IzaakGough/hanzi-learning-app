Status: done

# 015 Content Queue Hub

## Goal

Create the shared queue area for decomposition, unresolved props, sentence approval, audio failures, and other content work.

## Dependencies

- `010-decomposition-approval-and-unresolved-props`
- `014-sentence-schema-and-analysis`

## Deliverables

- queue item storage if still missing
- queue list UI with tabs/filters
- queue APIs/services for listing and updating items

## Required Queue Types

- decomposition candidates
- unresolved props
- sentence candidates
- audio failures
- missing lexical data

## Requirements

- queue views must be split by content type
- queue counts should be visible for dashboard integration
- queue items should support type-appropriate actions such as approve, reject, edit, regenerate, or resolve

## Acceptance Criteria

- queue hub can display items by type
- queue counts are queryable
- at least decomposition and unresolved prop items render end-to-end
- queue structure is reusable for sentence/audio tickets

## Non-Goals

- perfect bulk moderation UX
- analytics on queue throughput

