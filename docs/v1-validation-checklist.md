# V1 Validation Checklist

Run this command for the full local V1 readiness pass:

```bash
npm run v1:verify
```

It runs these checks in order:

- the generated lexical dictionary artifact and report are present and structurally valid
- normalized example fixtures parse cleanly
- normalized imports bootstrap a fresh database and report clear duplicate/invalid-file failures
- admin, search, decomposition, dashboard, queue, learning, review, sentence, audio, custom-item, and backup flows all verify against the current repo contracts
- review and queue UI sections still render the expected V1 blocker and workflow states

Baseline repo checks still apply before finishing work:

```bash
npm run build
npm run typecheck
```

Use `npm run imports:run` to inspect structured import diagnostics directly during local debugging. Duplicate or malformed normalized files should fail with path-specific error messages.
Use `npm run dictionary:generate` after replacing `data/dictionaries/raw/cc_cedict.u8` with a fresh CC-CEDICT export when you want to regenerate the lexical enrichment artifact.
