Status: done

# 001 Project Scaffold

## Goal

Create the initial monorepo structure for the local-first app.

## Dependencies

None.

## Deliverables

- `apps/web`
- `apps/api`
- `packages/shared`
- root `package.json`
- workspace configuration
- baseline TypeScript configuration

## Requirements

- Use npm workspaces
- Use TypeScript in all app/package directories
- Frontend should be React + Vite
- Backend should be Node + TypeScript
- Add a basic API healthcheck endpoint

## Acceptance Criteria

- `npm install` succeeds
- `npm run dev` starts web and api processes
- web app renders a placeholder page
- api responds successfully on `/health`
- workspace scripts exist for build, dev, lint, typecheck

## Non-Goals

- database integration
- auth
- styling system design

## Notes For Agent

Do not invent alternative stacks. Follow `docs/v1-architecture.md`.

