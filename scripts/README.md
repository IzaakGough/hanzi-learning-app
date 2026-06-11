# Raw Export Normalization Scripts

These scripts convert raw Pleco and Notion exports into the normalized JSON files consumed by the app import pipeline.

## Commands

```bash
npm run normalize:pleco:characters -- --input data/imports/raw-examples/pleco-characters.tsv --output data/imports/examples/known_characters.json
npm run normalize:pleco:words -- --input data/imports/raw-examples/pleco-words.tsv --output data/imports/examples/known_words.json
npm run normalize:notion:levels -- --input data/imports/raw-examples/notion-levels.csv --output data/imports/examples/levels.json --source-name mandarin-blueprint-levels-normalized
npm run normalize:notion:mappings -- --input data/imports/raw-examples/notion-pinyin-mappings.csv --output data/imports/examples/pinyin_mappings.json --source-name mandarin-blueprint-pinyin-mappings
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

## Limitations

- the scripts do not try to infer alternate Pleco or Notion column layouts
- duplicate item detection is left to the shared normalized import schemas and importer validation
- the output is JSON only, matching the current v1 import contract

## Verification

Run `npm run normalize:verify` to normalize the checked-in raw example files and validate the generated payloads against the shared import schemas from ticket `003`.
