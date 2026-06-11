# Contributing

This repository is primarily built by ticket-focused agents. The goal of this file is to keep implementation consistent across fresh sessions and different agents.

## Required Read Order

Before making code changes for a ticket, read in this order:

1. `docs/tickets/<current-ticket>.md`
2. `docs/v1-architecture.md`
3. `docs/engineering-decisions.md`
4. the relevant existing code in the repo

Optional background:

- `docs/product-spec.md`
- `docs/mvp-plan.md`

## Ticket Execution Rules

- Work on one ticket at a time.
- Keep changes scoped to the active ticket.
- Do not redesign adjacent tickets unless the current ticket is blocked by a real contract issue.
- Prefer updating docs only when the ticket requires it or implementation forces a real contract change.
- If implementation reveals a genuine ambiguity, update `docs/engineering-decisions.md` instead of burying the decision in code.

## Verification Standard

A ticket is not done until all of the following are true:

- `npm run build` passes
- `npm run typecheck` passes
- any ticket-specific verification command passes
- the git working tree is clean except for the intended changes before commit

If you cannot run a meaningful verification step, document that explicitly in the final handoff.

## Database Rules

- SQLite is the canonical v1 database.
- Use `better-sqlite3`.
- Keep migrations append-only.
- Do not silently delete the local database during normal workflows.
- If a reset workflow is needed, add an explicit `db:reset` script rather than deleting the DB ad hoc.

## Import Rules

- The app consumes normalized import files, not raw Pleco or raw Notion exports, in the current phase.
- JSON is the required import format unless a ticket says otherwise.
- Do not silently overwrite curated data during import.
- Use structured diagnostics for import warnings and errors.
- Keep import logic in the API/service layer, not in the frontend.

## Shared Contract Rules

- Shared enums, shared domain types, and reusable import schemas belong in `packages/shared`.
- Avoid duplicating domain constants separately in the API and web packages.
- If a contract is used by more than one package, move it into `packages/shared`.

## Scope Control Rules

- Do not add sentence, audio, review, or custom-item features in tickets that are only about imports or schema work.
- Do not add UI flows when the ticket is service-only unless the ticket explicitly requires them.
- Do not introduce new infrastructure without a ticket-driven reason.
- Prefer the smallest implementation that satisfies the ticket and keeps future tickets unblocked.

## Code Organization Rules

Default structure:

- `apps/api/src/db/` for connection and migration concerns
- `apps/api/src/services/` for business logic
- `apps/api/src/imports/` for import-specific entry points and helpers
- `packages/shared/src/` for cross-package contracts
- `data/imports/examples/` for human-readable normalized example files

Do not add a heavy ORM or broad repository layer unless repeated query duplication makes it necessary.

## Commit Hygiene

- Prefer one ticket-focused commit when practical.
- Do not mix unrelated cleanup into the same commit.
- Commit messages should describe the ticket outcome, not every tiny edit.

## Escalation Rules

Stop and document the issue instead of guessing if:

- product behavior conflicts with written docs
- a schema change would alter future ticket contracts materially
- import semantics are unclear
- a ticket appears to require violating a documented repo rule

When blocked by ambiguity, update docs first or ask for direction rather than encoding a silent assumption.

## Fresh-Agent Handoff Rule

A fresh agent should be able to continue from the repo without chat history.

That means each ticket implementation should leave behind:

- clear code structure
- passing build/typecheck
- any new executable verification command checked in if useful
- documentation updates only when they change repo contracts
