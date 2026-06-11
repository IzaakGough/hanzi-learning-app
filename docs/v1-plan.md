# V1 Plan

## Objective

Complete the first full single-user version of the Hanzi Learning App described in `docs/product-spec.md`.

V1 includes:

- normalized import pipeline
- Pleco/Notion normalization scripts
- pinyin mapping admin
- prop management
- lexical enrichment
- level progression and learning mode
- decomposition approval and unresolved prop handling
- FSRS review mode
- dashboard/home workflow
- sentence schema, generation, approval, and browsing
- audio generation for approved sentences
- custom items outside curriculum
- soft archive and explicit review reset flows
- backup/export and developer reset workflows
- validation and polish sufficient for sustained local use

## Milestones

### Milestone 1: Data Foundation

- `001-project-scaffold.md`
- `002-schema-and-shared-types.md`
- `003-normalized-import-contracts.md`
- `004-import-pipeline.md`

### Milestone 2: Learning Foundation

- `005-mapping-admin-and-props.md`
- `006-lexical-enrichment.md`
- `007-search-and-detail-views.md`
- `008-level-progression-and-learning-mode.md`
- `010-decomposition-approval-and-unresolved-props.md`

### Milestone 3: Review Foundation

- `011-fsrs-review-engine.md`
- `012-review-mode-ui.md`
- `013-dashboard-and-priority-flow.md`

### Milestone 4: Sentence And Audio Layer

- `014-sentence-schema-and-analysis.md`
- `015-content-queue-hub.md`
- `016-sentence-generation-and-approval.md`
- `017-manual-sentence-entry-and-sentence-bank.md`
- `018-audio-generation.md`

### Milestone 5: V1 Completion

- `009-raw-export-normalization-scripts.md`
- `019-custom-items-archive-and-review-reset.md`
- `020-backup-export-and-reset-tools.md`
- `021-v1-validation-and-polish.md`

## Definition Of V1 Complete

V1 is complete when:

- a user can bootstrap known characters/words from Pleco-derived normalized data
- curriculum levels can be imported, enriched, and learned in-app
- prop-based decomposition can be approved and maintained in-app
- characters and words can enter and progress through SRS review
- approved example sentences can be attached to words and browsed
- approved sentence audio can be generated and played
- custom items can be added outside curriculum without corrupting the model
- the local database can be backed up/exported and safely reset in development
- the app is coherent enough that a fresh agent can keep extending it from repo docs alone
