# Raw Export Normalization Scripts

These scripts convert raw Pleco and Notion exports into the normalized JSON files consumed by the app import pipeline.
The lexical dictionary generator lives here as well, but it outputs to `data/dictionaries/` because that artifact is enrichment data, not a normalized import fixture.

## Commands

```bash
npm run normalize:pleco:characters -- --input data/imports/raw-examples/pleco-characters.tsv --output data/imports/examples/known_characters.json
npm run normalize:pleco:words -- --input data/imports/raw-examples/pleco-words.tsv --output data/imports/examples/known_words.json
npm run normalize:notion:levels -- --input data/imports/raw-examples/notion-levels.csv --output data/imports/examples/levels.json --source-name mandarin-blueprint-levels-normalized
npm run normalize:notion:mappings -- --input data/imports/raw-examples/notion-pinyin-mappings.csv --output data/imports/examples/pinyin_mappings.json --source-name mandarin-blueprint-pinyin-mappings
npm run normalize:chise:ids -- --input data/imports/raw-examples/chise-ids-sample.txt --output data/imports/structural/chise_ids.json --source-name chise_ids_curated_v1
npm run prepare:chise:ids
npm run normalize:chise:ids -- --input data/imports/private/raw/chise-ids-ucs-abstract.txt --output data/imports/structural/chise_ids.json --source-name chise_ids_ucs_abstract_v1
npm run dictionary:generate
npm run dictionary:verify
```

## Input Assumptions

These scripts intentionally target one documented personal-export shape instead of every Pleco or Notion variant.

### Pleco Characters

- UTF-8 TSV file
- header row with `Hanzi`, `Pinyin`, and either `Definition` or `Meaning`
- optional `Notes` column
- blank optional cells are omitted from the normalized JSON

### Pleco Words

- UTF-8 TSV file
- header row with `Word`, `Pinyin`, and either `Definition` or `Meaning`
- optional `Notes` column

### Notion Levels

- UTF-8 CSV file
- header row with `Course`, `Sequence Number`, `Title`, `Characters`, `Words`, and optional `Notes`
- `Characters` and `Words` cells use `|` as the in-cell separator
- `Sequence Number` must be a positive integer

### Notion Pinyin Mappings

- UTF-8 CSV file
- header row with `Kind`, `Symbol`, `Mapped Value`, and optional `Notes`
- `Kind` must already use the normalized values `initial`, `final`, or `tone`
- zero initial/final rows should use the literal symbol `null`

### CHISE IDS

- UTF-8 tab-delimited text file
- one row per structure with `codepoint`, `hanzi`, and `ids` columns
- comment lines beginning with `#` or `;;` are ignored
- upstream UCS rows with an empty functional IDS and an `@apparent=` fallback are supported
- trailing CHISE variant markers such as `[J]` and `[X]` are stripped during normalization
- the current normalizer flattens IDS leaves into ordered parts because the app's candidate model is currently flat, not grouped
- binary, ternary, and CHISE extended IDC operators used in the UCS dataset are supported for this v1 slice

## Limitations

- the scripts do not try to infer alternate Pleco or Notion column layouts
- duplicate item detection is left to the shared normalized import schemas and importer validation
- the output is JSON only, matching the current v1 import contract
- `npm run prepare:chise:ids` merges the official CHISE `IDS-UCS-*` abstract-character files into the three-column input expected by the normalizer
- the checked-in `data/imports/structural/chise_ids.json` is now generated from the official CHISE UCS abstract-character dataset

## Verification

Run `npm run normalize:verify` to normalize the checked-in raw example files and validate the generated payloads against the shared import schemas, including the structural decomposition dataset.

Run `npm run dictionary:verify` to validate the checked-in lexical dictionary artifact and report used by lexical enrichment.
