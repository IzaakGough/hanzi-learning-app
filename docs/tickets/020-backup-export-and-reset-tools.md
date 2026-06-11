Status: done

# 020 Backup, Export, And Reset Tools

## Goal

Add the operational tooling needed to preserve, export, and safely reset the local app state.

## Dependencies

- `004-import-pipeline`
- `019-custom-items-archive-and-review-reset`

## Deliverables

- full backup/export flow
- targeted exports for key datasets
- explicit `db:reset` developer workflow
- documentation for backup/reset behavior

## Required Exports

- full database backup
- known characters export
- known words export
- props export
- approved decompositions export

## Requirements

- reset must be explicit, never implicit
- exported data must be usable for inspection and basic portability
- backup/export commands should be scriptable from local CLI workflows

## Acceptance Criteria

- a full database backup can be generated
- key dataset exports can be generated
- `db:reset` recreates a clean local database and reruns migrations
- docs explain what reset does and does not preserve

## Non-Goals

- live cloud sync
- full Pleco re-export integration
