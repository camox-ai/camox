# 06 — Local Dev Bootstrap

## Goal

When a developer runs the project locally (fresh clone or wiped local DB), the local backend automatically has the project row it needs. Content population is handled separately by plan 05.

## Flow

On `pnpm dev` (or equivalent dev script):

1. Read `.camox.json` → get `projectSlug`, `name`, `domain`
2. Query local backend for a project with that slug
3. If it doesn't exist, create it via a bootstrap mutation
4. Sync block definitions and layouts from the codebase (existing `syncBlockDefinitions` and `syncLayouts` flows already handle this)

After bootstrap, the local backend has:

- A project row (so content can reference a `projectId`)
- Block definitions and layouts (synced from code)
- No pages/blocks/files yet (that's what plan 05 handles)

## Implementation options

- **Dev script wrapper**: a `camox dev` command or a pre-dev script that runs the bootstrap before starting the Convex dev server
- **On-load mutation**: the SDK UI itself calls a bootstrap mutation on startup that upserts the project from the `.camox.json` values

The on-load approach is simpler and doesn't require a separate CLI step.

## Depends on

- Plan 01 (`.camox.json` and slug)
