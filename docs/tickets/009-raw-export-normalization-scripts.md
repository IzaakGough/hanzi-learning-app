Status: done

# 009 Raw Export Normalization Scripts

## Goal

Create local scripts that transform raw Pleco and Notion exports into the normalized JSON formats defined in ticket `003`.

## Dependencies

- `003-normalized-import-contracts`
- `004-import-pipeline`

## Deliverables

- normalization scripts under `scripts/`
- usage documentation
- sample command invocations

## Required Inputs

- Pleco characters export
- Pleco words export
- Notion levels export
- Notion actor/set/location export

## Requirements

- produce normalized JSON matching the shared import schemas
- keep source-specific parsing isolated from the app import service
- output files should be suitable for direct import by ticket `004` tooling
- scripts may assume your personal export shape, but must document those assumptions clearly

## Acceptance Criteria

- a raw Pleco characters export can be normalized into `known_characters.json`
- a raw Pleco words export can be normalized into `known_words.json`
- a raw Notion levels export can be normalized into `levels.json`
- a raw Notion mappings export can be normalized into `pinyin_mappings.json`
- usage docs explain expected input file shapes and limitations

## Non-Goals

- app UI for running these scripts
- handling every possible third-party export variant
