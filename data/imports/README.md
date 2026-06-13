# Normalized Import Formats

The app imports normalized JSON datasets in v1.

Raw Pleco and Notion exports are not consumed directly by the app in this phase.

Example fixtures live in `data/imports/examples/`.
The lexical dictionary is not an import fixture; it lives under `data/dictionaries/`.
The structural decomposition dataset lives under `data/imports/structural/` because it seeds decomposition candidates but is not consumed by `imports:run` as a user-supplied normalized import payload.

Raw export examples that match the ticket `009` normalization scripts live in `data/imports/raw-examples/`.
Usage and input-shape assumptions for those scripts live in `scripts/README.md`.

## Files

- `known_characters.json`
- `known_words.json`
- `levels.json`
- `pinyin_mappings.json`
- `structural/chise_ids.json`

## Shared Rules

- `version` is currently `1`
- `sourceName` should identify the origin of the normalized file
- `importType` determines which validator/schema applies

## Duplicate And Conflict Rules

### Known Characters

- duplicate `hanzi` entries in one file should be treated as invalid input by the importer
- if an item already exists in the database, later import behavior will be handled by ticket `004`

### Known Words

- duplicate `simplified` entries in one file should be treated as invalid input by the importer

### Levels

- `(course, sequenceNumber)` must be unique
- the same character or word may appear in many files over time, but duplicate occurrences across levels should be surfaced by the importer as warnings or errors because the curriculum assumes one introduction point per word

### Pinyin Mappings

- `(kind, symbol)` must be unique
- if multiple rows define different mappings for the same `(kind, symbol)`, importer should reject the file

## Notes

- JSON is the only required format for ticket `003`
- CSV support can be added later if useful
- repo-example decomposition fixtures are not imported by default; set `HANZI_SEED_EXAMPLE_DECOMPOSITIONS=1` only when you intentionally want the example approved/candidate decomposition data seeded during import
- repo-local structural decomposition data is seeded automatically after normalized imports so blocked characters can receive candidate decompositions without auto-approval
- the checked-in `structural/chise_ids.json` is generated from the official CHISE `IDS-UCS-*` abstract-character files rather than from the small raw-example sample
- lexical dictionary generation and verification are documented in `data/dictionaries/README.md`
