## Phase 1 — Snapshot Plumbing, No Behavior Change

Part of [Draft & Publish](./draft-publish.md). Read that first for the conceptual model.

### Scope

Add the schema and read-path machinery needed to support checkpoints, migrate existing data so every page/layout starts life with a single `auto-publish` checkpoint pointed at by its live pointer, and switch the public-facing SDK loader to read from that pointer instead of live rows. No publish action exists yet — checkpoints are only ever created by the migration. No UI changes. No status badge. No source toggle.

### Why ship this with no visible change

This phase is load-bearing for everything that follows. The riskiest part of the whole design — that a snapshot read produces a byte-identical `PageView` to a live-row read — gets exercised by every page load in production, with no escape hatch but also no UI surface that could regress. If the public site keeps rendering correctly across the migration, the snapshot contract holds.

### Database changes

**New tables**

- `page_checkpoints(id, page_id, kind, label, snapshot, schema_version, created_at, created_by)`
- `layout_checkpoints(id, layout_id, kind, label, snapshot, schema_version, created_at, created_by)`

`kind` is one of `auto-publish | manual | auto-draft` — the full enum ships now even though only `auto-publish` is written in v1. `snapshot` is a JSON blob in a TEXT column. `schema_version` is a one-way ratchet so we can evolve the snapshot shape later — older snapshots are read through a migration function, new ones are written at the current version. `created_by` is the user id; nullable for system-created checkpoints (the initial migration writes NULL). Indexed on `(page_id, created_at DESC)` (resp. `(layout_id, created_at DESC)`) for history listing, even though no UI lists them yet.

**New columns**

- On `pages`: `live_published_checkpoint_id` (nullable FK to `page_checkpoints`), `content_updated_at` (timestamp).
- On `layouts`: same two columns, FK targeting `layout_checkpoints`.

The pointer is what makes a page "live" — no extra status table or status column anywhere else.

**Referential integrity**

`page_checkpoints.page_id` and `layout_checkpoints.layout_id` cascade-delete (deleting a page drops its history with it — no orphan-history concept). `live_published_checkpoint_id` is a nullable FK with `ON DELETE SET NULL` defensively, though in practice the studio prevents deletion of the row currently pointed at.

### Snapshot shape

The `snapshot` column holds a JSON blob whose shape is **identical to what `pages.getByPath` already returns from live rows**: `{ page, blocks, repeatableItems }` for a page; `{ layout, blocks, repeatableItems }` (with `placement: 'before' | 'after'` per block) for a layout. Blocks keep their `_itemId` markers in content; repeatable items are listed separately and resolved back in by the client, exactly as today. File references stay as `{ _fileId }` markers in content; the renderer resolves IDs against the live `files` table at read time, identical code path to draft mode.

This shape-identity is the load-bearing property of the whole design: it means `(source: 'live' | 'draft' | { checkpointId }) → PageView` is a single contract, and the renderer never branches on source.

A page snapshot does _not_ contain its layout's blocks — `page.layoutId` references the layout, and the layout's own live checkpoint provides the layout half. Composition `page snapshot + layout snapshot` happens at the page-fetch level, the same way `live page rows + live layout rows` already compose in `getByPath` today.

### API changes (`apps/api`)

**Read path: `source` parameter on page/layout reads**

`pages.getByPath` and the layout read gain a `source: 'live' | 'draft' | { checkpointId }` parameter. Default is `'live'` (matches what the public SDK loader needs; the studio passes `'draft'` explicitly when we add Phase 2).

- `'draft'` — today's joined queries against live tables, unchanged.
- `'live'` — read the parent row, follow `live_published_checkpoint_id`, read one checkpoint row, `JSON.parse(snapshot)`, return. If the pointer is NULL, return null (the public router turns this into 404).
- `{ checkpointId }` — read that checkpoint directly. No row scanning. Used later by the history sidebar; plumbed now so the contract is settled.

Page snapshot + layout snapshot composition happens here: a `source: 'live'` page read also resolves the page's layout via `source: 'live'` on the layout side.

**Per-block read: `blocks.get(id, source)`**

Gains the same parameter for symmetry. `'draft'` is unchanged (the hot path during editing). `'live'` and `{ checkpointId }` locate the parent (page or layout) by id, read its snapshot, extract the block. Mildly wasteful (parses N KB to return one block's worth) but never the hot path — published state never mutates piecewise, so per-block invalidation against `'live'` is a code path that never fires in normal operation.

**Write path: bump `content_updated_at`**

All block / repeatable-item mutations bump the parent page's or layout's `content_updated_at`. This is the single additional cost on the hot edit path. It's what makes status (in Phase 2) a single-timestamp compare instead of a row scan.

### API contract (`packages/api-contract`)

- Add the `source` parameter to existing read procedures (`pages.getByPath`, layout reads, `blocks.get`). No new procedures yet.

### SDK runtime (`packages/sdk`)

- The page loader used by the deployed site calls `getByPath` with `source: 'live'` (or just relies on the default). If null → 404.
- The studio's preview loader stays on draft data — but no source select exists yet, so it implicitly hits `source: 'draft'` everywhere. This is fine because the migration ensures every existing page has a fresh `auto-publish` checkpoint identical to its draft state, so draft and live produce the same render until someone edits.

### Migration

For each existing page:

1. Serialize its current state into a snapshot in the canonical shape.
2. INSERT an `auto-publish` checkpoint with `created_by = NULL`, `schema_version = 1`.
3. UPDATE `live_published_checkpoint_id` to point at it.
4. Initialize `content_updated_at` to the row's `updated_at`.

Same for each existing layout.

Result: no visible change for visitors; every page starts life "published" with a single checkpoint, and users can start drafting from there in Phase 3.

### How to verify before moving on

This phase has no UI; verification is mostly invariants and snapshot tests:

- **Snapshot-vs-live equality.** For every page in a fresh-migrated test DB, `getByPath(path, 'draft')` and `getByPath(path, 'live')` return byte-identical `PageView` objects (modulo any deliberately-stripped fields like internal timestamps).
- **Public site renders unchanged.** Run the deployed site against a migrated DB. Every page that was working before still renders identically. The renderer doesn't know it's now reading from a snapshot.
- **404 contract.** Manually NULL out a page's `live_published_checkpoint_id` in a test DB. The public router returns 404. The studio (which hasn't changed yet) still shows the draft fine.
- **`content_updated_at` bumps.** Edit a block, observe the parent page's `content_updated_at` advance. Edit a repeatable item, same. Edit a layout block, observe the layout's timestamp advance (not the page's — that's Phase 4's cascading concern).
- **Migration idempotency.** Run the migration twice on a copy — second run should be a no-op (or guarded with a "already migrated" check). Get this right before production.

### What's explicitly out of scope for this phase

- No publish, unpublish, or restore procedures. The `auto-publish` checkpoint table only ever grows via the one-time migration.
- No status field on the page list.
- No Draft / Live toggle in the studio.
- No history listing endpoint (the index on `(page_id, created_at DESC)` ships, but nothing reads it yet).
- No changes to `files.replace` or `files.delete` semantics — they keep operating on live rows. The checkpoint-aware warning on delete is deferred indefinitely.

### Storage growth

After migration: exactly one checkpoint per page and per layout, sized in the few-KB to few-tens-of-KB range each. No ongoing growth in Phase 1 — no new checkpoints are written until Phase 3 ships the publish action.
