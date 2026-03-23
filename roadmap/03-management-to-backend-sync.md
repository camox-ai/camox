# 03 — Management → Backend Sync

## Goal

When a project is created, updated, or deleted in management, the change is propagated to the production backend so it has the project row needed for content scoping.

## Sync mechanism

Management action → HTTP POST to production backend endpoint, authenticated with a shared secret (`SYNC_SECRET` env var on both deployments).

### Create flow

1. Management mutation inserts project row
2. Schedules an action (`ctx.scheduler.runAfter(0, ...)`)
3. Action calls `POST <BACKEND_SITE_URL>/projects/sync` with `{ slug, name, domain, organizationId }`
4. Backend HTTP handler verifies shared secret, runs an `internalMutation` to upsert the project
5. Returns `{ backendProjectId }`
6. Management action stores the `backendProjectId` on its own project row (useful for direct references later)

### Update flow

Same endpoint, PATCH semantics. Backend finds project by slug and patches fields.

### Delete flow

Management calls `DELETE <BACKEND_SITE_URL>/projects/sync?slug=xxx`. Backend runs its existing cascade-delete logic (pages → blocks → repeatable items → files) via an internal mutation.

## Auth

Server-to-server shared secret. No user tokens involved in the sync path.

## Depends on

- Plan 01 (slug for cross-environment identification)
- Plan 02 (management as the source of truth)
