# Backup And Export Output

This directory is the default target for ticket `020` operational outputs.

## Structure

- `backups/`: full SQLite database backups created by `npm run db:backup`
- `datasets/`: JSON dataset exports created by `npm run exports:run`

## Notes

- generated backup and dataset files are intentionally gitignored
- `db:reset` does not delete this directory
- the checked-in import fixtures under `data/imports/` are separate from these generated outputs
