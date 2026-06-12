# Lexical Dictionary Artifacts

This directory holds the repo-local lexical dictionary used by import-time enrichment.

## Files

- `raw/cc_cedict.u8`: CC-CEDICT source file path used by the generator. The checked-in file is a small excerpt for deterministic repo verification. Replace it locally with a full CC-CEDICT export when you want a production-sized dictionary artifact.
- `lexical_dictionary.json`: generated runtime dictionary consumed by `apps/api` lexical enrichment.
- `lexical_dictionary_report.json`: generated report describing source counts, output counts, and omission/conflict visibility.

## Regeneration

Run:

```bash
npm run dictionary:generate
npm run dictionary:verify
```

The generator is deterministic for a fixed input file and source name. It writes numbered-pinyin runtime entries and a persisted report without introducing a live external dependency into the app.
