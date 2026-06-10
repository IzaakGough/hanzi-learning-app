# 003 Normalized Import Contracts

## Goal

Define and validate the normalized import formats the app will accept.

## Dependencies

- `001-project-scaffold`
- `002-schema-and-shared-types`

## Deliverables

- import format documentation
- runtime validation schemas
- sample fixture files

## Required Formats

- `known_characters`
- `known_words`
- `levels`
- `pinyin_mappings`

## Requirements

- Support JSON first
- CSV support is optional in this ticket
- Define required fields and optional fields explicitly
- Include provenance/source fields where needed

## Acceptance Criteria

- fixture files exist in `data/imports/examples/`
- validators reject malformed payloads
- validators accept valid payloads
- docs explain duplicate and conflict handling

## Non-Goals

- importing raw Pleco or raw Notion exports directly
