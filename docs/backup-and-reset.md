# Backup, Export, And Reset Workflows

Ticket `020` adds local CLI workflows for preserving and resetting app state.

## Commands

```bash
npm run db:backup
npm run db:backup -- --output data/exports/backups/manual.sqlite
npm run exports:run
npm run exports:run -- --dataset known_characters --dataset approved_decompositions
npm run db:reset -- --yes
```

## Default Output Locations

- full database backups: `data/exports/backups/`
- dataset exports: `data/exports/datasets/`

The export root can be overridden with `HANZI_EXPORTS_DIR`. The database path can already be overridden with `HANZI_DB_PATH`.

## Exported Datasets

- `known_characters.json`: learned non-archived characters in the normalized import format
- `known_words.json`: learned non-archived words in the normalized import format
- `props.json`: prop admin snapshot with activation state
- `approved_decompositions.json`: approved decomposition snapshot with ordered part resolution details

## Reset Behavior

`npm run db:reset -- --yes` deletes only app-managed local state for the active database directory:

- the SQLite database file
- the matching `-wal` and `-shm` sidecar files
- generated media under that database directory

Reset does not preserve database contents or generated local media.

Reset does not delete:

- checked-in fixtures under `data/imports/`
- generated backups and dataset exports under `data/exports/`

After deletion, the command reruns migrations immediately so the local database is recreated with a clean schema.
