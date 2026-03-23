# 05 — Pull Production Content to Local Dev

## Goal

When a developer opens the SDK UI locally and the project has no content, offer to pull the full production state into the local environment. This gives a realistic dev experience without manual data entry.

## Detection

The SDK UI queries the local backend on load. If the project row exists (bootstrapped from `.camox.json`) but has zero pages, it triggers the pull dialog.

## UI

A dialog in the SDK UI:

> "This project has X pages and Y blocks in production. Pull production content to your local environment?"

Management provides the counts cheaply so the user knows what they're getting.

A manual "Pull from production" button in SDK settings allows re-pulling at any time (wipe-and-replace semantics).

## Flow

1. **SDK UI → management backend**: "I want to pull project `prestigious-impala-84`" (user is already authenticated with management)
2. **Management**: verifies the user owns this project, returns a short-lived token + the production backend snapshot URL
3. **SDK UI → production backend**: `GET /projects/snapshot?slug=...` with the token, receives the full snapshot (project, pages, layouts, block definitions, blocks, repeatable items, file metadata with CDN URLs)
4. **SDK UI → local backend**: sends the snapshot to an internal action
5. **Local backend action**: ingests everything:
   - Inserts rows in topological order (project → pages → layouts → block defs → blocks → repeatable items), remapping Convex `_id` references via an in-memory ID map
   - For each file: fetches bytes from the production CDN URL, stores in local Convex storage via `ctx.storage.store()`, creates a file record with the local URL

## Why management is the middleman (but not a proxy)

Management authorizes the pull but doesn't shuttle the payload. It gives the SDK a token to fetch directly from production backend. This keeps large snapshots (especially file bytes) off management's action runtime.

## Re-pull / reset

Wipe-and-replace: delete all local content for the project, then re-run the pull. No merge logic — local dev is disposable.

## Depends on

- Plan 01 (slug for identifying the project)
- Plan 02 (management knows which projects exist and who owns them)
- Plan 04 (pulled files land in local Convex storage, not Bunny)
