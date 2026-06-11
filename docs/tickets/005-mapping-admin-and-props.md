Status: todo

# 005 Mapping Admin And Props

## Goal

Build the first admin UI/API for pinyin mappings and props.

## Dependencies

- `001-project-scaffold`
- `002-schema-and-shared-types`
- `004-import-pipeline`

## Deliverables

- pinyin mapping list/edit UI
- prop list/search/create/edit UI
- corresponding API routes

## Requirements

- mappings must support initials, finals, tones
- null initial/null final must be representable in data
- props require:
  - name
  - type
  - shape ref
  - meaning or image

## Acceptance Criteria

- mappings can be viewed and edited in browser
- props can be created and edited in browser
- prop search works by name or meaning
- all pages load using local API data

## Non-Goals

- decomposition approval flow
- advanced archive management

