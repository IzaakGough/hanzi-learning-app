# MVP Plan

## Objective

Ship the first usable version of the app with:

- importable known sets
- importable curriculum levels
- deterministic lexical data for characters/words
- level-based learning flow
- prop management
- decomposition approval
- basic search and detail views

## Included In MVP

- app scaffold
- SQLite schema and migrations
- shared type/enums package
- normalized imports
- Pleco/Notion normalization scripts
- pinyin mapping admin
- prop management
- dictionary-first lexical enrichment
- level progression engine
- learning mode
- decomposition suggestion + approval
- search
- character detail view
- word detail view

## Deferred To Post-MVP

- sentence generation
- sentence approval UI
- audio generation
- dashboard polish
- custom items outside curriculum
- backup/export polish
- archive flows

## Why This Cut

This MVP proves the core thesis:

- imported curriculum can become structured local study content
- personalized mnemonic decomposition can be managed in-app
- the app can drive daily learning without depending on Pleco at runtime

## MVP Build Order

1. Project scaffold
2. Schema + shared enums
3. Normalized import contracts
4. Import pipeline
5. Mapping admin
6. Prop management
7. Lexical enrichment
8. Search + detail views
9. Level progression engine
10. Learning mode
11. Decomposition suggestion + approval

## Exit Criteria

MVP is complete when:

- known characters/words can be imported
- levels can be imported and enriched
- characters/words can be browsed and searched
- current level progression works
- character cards can be learned
- word unlock rules work
- decomposition blockers can be resolved and approved

Review mode is valuable, but may be split into the next milestone if the learning foundation still needs work.
