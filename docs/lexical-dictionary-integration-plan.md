# Lexical Dictionary Integration Plan

## Purpose

This document captures the implementation decisions made for replacing the repo's example lexical dictionary with a real generated dictionary based on CC-CEDICT.

Future agents should use this document as the primary handoff for dictionary integration work, alongside:

1. `docs/tickets/006-lexical-enrichment.md`
2. `docs/v1-architecture.md`
3. `docs/engineering-decisions.md`
4. current repo state

For follow-up work after the full CC-CEDICT source was installed and generated, also read:

5. `docs/lexical-dictionary-followup-handoff.md`

## Problem Statement

The current lexical enrichment flow already expects a local dictionary file and uses it to backfill missing lexical data during import. However, the checked-in dictionary is only a small example fixture and is not sufficient for real app use.

The goal is to replace that example dictionary with a generated derived dataset that can support real lexical enrichment for imported characters and words.

## Current Repo Reality

As of this handoff:

- lexical enrichment is implemented in `apps/api/src/services/imports/lexical-enrichment-service.ts`
- the service currently reads a JSON file directly from disk
- the current path is `data/imports/examples/lexical_dictionary.json`
- the dictionary is not part of the normalized import contracts
- the dictionary is not imported into SQLite as its own table
- lexical enrichment writes selected dictionary values onto canonical `characters` and `words` rows in SQLite

Matching is currently exact-text lookup only:

- characters: `hanzi`
- words: `simplified`

## Chosen Direction

Implement a tactical v1 fix that preserves the current enrichment architecture:

- use CC-CEDICT as the upstream lexical source
- do not scrape MDBG HTML pages
- do not depend on a live external service at runtime
- do not introduce a new normalized import type yet
- do not add a new dictionary database table yet
- do not redesign enrichment to be curriculum-aware or context-aware

Instead:

- generate a repo-local derived dictionary artifact
- point lexical enrichment at that artifact
- keep enrichment offline and exact-text-based

## Source And Tooling Decisions

### Upstream source

Use CC-CEDICT as the upstream dataset.

### Parser implementation

Implement the generator in the repo's existing Node `mjs` script style.

Do not make the external Python parser a runtime or build dependency. It may be used as reference only if useful.

## Output Artifacts

### Canonical generated dataset

Store the generated dictionary at:

- `data/dictionaries/lexical_dictionary.json`

This file replaces the role currently played by the example fixture, but should live outside `data/imports/examples/` because it is no longer an example dataset.

### Companion report

Also generate:

- `data/dictionaries/lexical_dictionary_report.json`

Recommended optional supporting doc:

- `data/dictionaries/README.md`

## Runtime Integration Model

The dictionary should continue to be used as an enrichment lookup source, not as an import payload and not as a dedicated DB table in v1.

Expected flow:

1. normal imports create or update canonical `characters` and `words`
2. lexical enrichment runs after imports
3. lexical enrichment loads the generated dictionary file
4. blank lexical fields are backfilled from dictionary matches
5. enriched values are persisted onto the canonical rows in SQLite

This means the dictionary is write-through enrichment data, not a live runtime dependency for everyday reads after enrichment has happened.

## Data Contract For The Generated Dictionary

The generator should target the existing enrichment shape:

```json
{
  "sourceName": "cc_cedict_generated_v1",
  "characters": [
    {
      "text": "<single_character>",
      "pinyinDisplay": "<numbered_pinyin>",
      "meaningPrimary": "<primary_meaning>"
    }
  ],
  "words": [
    {
      "text": "<multi_character_word>",
      "pinyinDisplay": "<numbered_pinyin_sequence>",
      "meaningPrimary": "<primary_meaning>"
    }
  ]
}
```

### Provenance

Use a derived local provenance name such as:

- `cc_cedict_generated_v1`

The generated file should identify itself as a derived dataset, not pretend to be raw upstream CC-CEDICT.

## Scope Decisions

### Storage format

Keep numbered pinyin as the canonical stored format for v1.

Do not migrate the codebase to tone-mark canonical storage in this implementation.

Reason:

- the codebase currently assumes numbered pinyin in validation, splitting, editing, fixtures, and verification flows
- switching storage format now would become a cross-cutting migration rather than a dictionary integration task

### Character entry selection

Populate `characters` only from true single-character dictionary entries.

Do not infer character meanings or readings from multi-character words.

### Word entry selection

Populate `words` from multi-character dictionary entries.

### Full vs filtered dataset

Generate a full derived dictionary, not only a subset filtered to the current curriculum.

## Simplification Rules

The app's current enrichment schema only supports one chosen pinyin and one chosen primary meaning per text.

So the generator must collapse CC-CEDICT into one deterministic chosen entry per simplified text.

### Required v1 behavior

- group entries by simplified text
- choose one deterministic primary entry for each kept text
- store only:
  - `text`
  - `pinyinDisplay`
  - `meaningPrimary`

### Characters vs words

For characters:

- choose a deterministic primary reading even when multiple readings exist

For words:

- also choose one deterministic primary entry for v1
- do not block the dictionary rollout on ambiguity
- preserve visibility of suspicious cases in the report

### Non-goal

Do not attempt curriculum-aware disambiguation by looking at level context or containing words in v1.

## Pinyin Rules

### Output format

Normalize CC-CEDICT pinyin into the repo's numbered format during generation.

Store only numbered pinyin in the generated output.

### Conversion failures

If an upstream pinyin value cannot be converted cleanly into the repo's expected numbered format:

- omit that entry from the generated dictionary
- record the omission in the report
- do not fail the whole generation run

This should be measured rather than assumed to be large.

## Meaning Selection Rules

Apply light heuristic cleaning for `meaningPrimary`.

Recommended v1 behavior:

1. split definitions into candidate glosses
2. drop empty entries
3. skip obviously low-value primary senses when safer alternatives exist
4. choose the first remaining usable gloss deterministically

### Examples of low-value senses to de-prioritize

- classifier-only senses such as `CL:...`
- obvious `variant of ...`
- obvious `see also ...`

Do not attempt deep semantic rewriting or lexicographic cleanup in v1.

## Report Requirements

The generator should always produce a persisted report file.

The report should be deterministic and should break outcomes down by reason.

Recommended contents:

- upstream entry count processed
- generated character count
- generated word count
- omitted count by reason
- suspicious or conflicting groups
- samples or full lists of problematic entries
- output file metadata such as entry counts and file size

Important:

- pinyin conversion failures should be reported separately from ambiguity and other filtering outcomes
- alternate glosses and alternate readings do not belong in the main dictionary artifact, but may appear in the report for review purposes

## Determinism Requirement

Treat deterministic output as a hard requirement.

This includes:

- stable candidate grouping
- stable sorting
- stable tie-breaking
- stable output ordering in both generated files

If two runs use the same upstream source file and the same generator logic, the outputs should be byte-stable except for intentionally versioned changes.

## Validation Expectations For V1

Focus on integration correctness rather than exhaustive lexical QA.

Minimum expected validation:

1. confirm the generated dictionary file is readable and structurally valid
2. update the enrichment service to use the new path
3. verify that placeholder characters and words can be enriched from the generated dictionary
4. verify that the generated report is present and non-trivial

Do not expand v1 into:

- a new dictionary SQLite table
- live external dictionary dependency
- tone-mark storage migration
- full manual review workflow for ambiguous entries

## Open Implementation Tasks

Expected implementation work:

1. add a generator script such as `scripts/generate-lexical-dictionary.mjs`
2. move dictionary storage to `data/dictionaries/`
3. update `apps/api/src/services/imports/lexical-enrichment-service.ts` to read the new path
4. add validation for the generated artifact and report
5. update verification expectations that currently reference `repo_local_dictionary_v1`
6. document regeneration steps and upstream attribution

## Explicit Non-Goals

- no new normalized import contract for dictionaries in this pass
- no dedicated SQLite dictionary table in this pass
- no curriculum-aware or sentence-aware disambiguation in this pass
- no attempt to preserve all alternate senses/readings in the main runtime artifact
- no migration of canonical pinyin storage from numbered format to tone marks
