# 004 Import Pipeline

## Goal

Import normalized files into SQLite with validation, provenance tracking, and basic diagnostics.

## Dependencies

- `002-schema-and-shared-types`
- `003-normalized-import-contracts`

## Deliverables

- import services in `apps/api`
- endpoints or CLI commands to run imports
- persisted import log records

## Required Imports

- known characters
- known words
- levels
- pinyin mappings

## Requirements

- imports must be idempotent enough for repeated local testing
- duplicate words across levels should raise warnings/errors
- import source should be recorded on created rows
- imported known items should be marked learned

## Acceptance Criteria

- a clean database can be populated from normalized fixtures
- import errors are returned in readable form
- level items link to canonical character and word records
- Pleco known characters and words remain separate imports

## Non-Goals

- lexical enrichment
- raw export adapter scripts
