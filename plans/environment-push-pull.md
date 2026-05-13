## Environment Push & Pull

### Goal

Let users replicate content between their development environment and production from inside the studio, in either direction, as a single wipe-and-replace operation. No merging, no conflict resolution, no row-level diffing — the target environment's content becomes byte-identical to the source's at the moment of the push.

The mental model is Sanity's `sanity dataset copy`: pick a source, pick a target, confirm, and everything in the target is replaced. Push and pull are the same operation with the arguments swapped.

For v1, the only entry point is the existing `EnvironmentMenu` popover (`packages/sdk/src/features/studio/components/EnvironmentMenu.tsx`). No CLI, no oRPC clients beyond the studio.

### Current State

- Environments are first-class rows in the `environments` table (`apps/api/src/domains/projects/schema.ts`). Every project gets a `production` environment at creation; a `development` environment is autocreated per-user on first authenticated request via `resolveEnvironment(..., { autoCreate: true })`.
- Per-env data lives in `pages`, `layouts`, `block_definitions`, `files` (all carry `environment_id`).
- `blocks` and `repeatable_items` inherit their env transitively via FK (`pageId`/`layoutId` → env-scoped tables, `blockId` → blocks). Both cascade-delete from their parent.
- File blobs live in Cloudflare R2 under keys `{projectId}/{timestamp}-{filename}` — **not** environment-prefixed. The `files` row points at a blob via `blobId`; the URL `(/files/serve/{blobId})` is env-agnostic.
- File deletion (`deleteFile`, `deleteFiles`, `replaceFile`) currently unconditionally calls `FILES_BUCKET.delete(blobId)` after dropping the row. This is safe today because no two `files` rows share a `blobId`. It will not be safe once push/pull starts inserting rows that share blobs.
- File references inside content are stored as `{ "_fileId": <id> }` markers in `blocks.content`, `blocks.settings`, `repeatable_items.content`, `repeatable_items.settings`. The numeric ids are local to one environment.
- D1 is a single database per project; SQLite schema is shared across all environments of a project, so there is no question of column drift between envs. The only "definition drift" that matters is the user-authored block definitions and layouts (see below).
- The `EnvironmentMenu` popover already hints at this feature with placeholder copy: _"You will be able to pull and push data to the production env from here."_

### Files: Strategy B (Shared Blobs + Refcounting)

Pushing files is purely a database operation. We **do not** copy R2 objects.

For each `files` row in the source env, we insert a new row in the target env with:

- a fresh autoincrement `id`
- the new `environment_id`
- the **same** `blobId`, `path`, `url`, `filename`, `mimeType`, `size`, `alt`, `aiMetadataEnabled`

After replication, multiple rows across envs point at the same R2 object. To keep this safe, blob deletion becomes refcount-aware: an R2 object is only deleted when its **last** referencing row is removed.

Concretely, three functions in `apps/api/src/domains/files/service.ts` change:

- **`deleteFile`**: before `FILES_BUCKET.delete(blobId)`, run `SELECT id FROM files WHERE blob_id = ? AND id != ? LIMIT 1`. If a sibling exists, skip the R2 delete. Drop the row as normal.
- **`deleteFiles`**: same check, applied per-blob across the batch. Build the set of `blobId`s among the rows being deleted, then for each blob check whether any _other_ row (not in this batch) still references it; delete from R2 only those with zero remaining refs.
- **`replaceFile`**: the existing `FILES_BUCKET.delete(oldBlobId)` at the end of the flow becomes conditional on the same refcount check. The `oldBlobId` may now legitimately survive because the prod env points at it.

The `files_blob_id_idx` index already exists, so the refcount lookup is O(log n).

What we explicitly do **not** do in v1:

- No content-addressed (hash-keyed) blob storage. The current `{projectId}/{timestamp}-{filename}` scheme stays. Strategy C is a follow-up.
- No background GC sweep. Refcount-on-delete is sufficient; orphaned blobs only happen if a delete path forgets the check, and we own all delete paths.

### The Compatibility Check

Push/pull is **blocked** when the source and target environments disagree on what content can validly live in them. The check covers two things:

**1. Block definitions must match.** For every `blockId` (text key) present in either env, the row must exist in both, and these fields must be equal:

- `contentSchema` (JSON)
- `settingsSchema` (JSON, nullable)
- `layoutOnly` (boolean, nullable)

`title`, `description`, `defaultContent`, `defaultSettings` are documentation / authoring aids and are ignored by the comparison — they can drift without breaking content validity.

JSON equality is done via `JSON.stringify` after deep-sorting object keys (small util `stableStringify` in `apps/api/src/lib/`). Schemas are author-controlled but produced by code paths that already emit deterministic JSON, so this is robust.

**2. Layouts must match.** The set of `layoutId` text keys present in `layouts` must be identical between source and target. Layouts have no schema of their own to compare; their content (the layout blocks) is what's being replicated and so by definition does not need to pre-match.

When either check fails, the API returns a structured response listing the offending keys and the specific reason per key, e.g.:

```ts
{
  compatible: false,
  reasons: [
    { kind: "block-definition-missing-in-target", blockId: "pricing-table" },
    { kind: "block-definition-schema-mismatch", blockId: "hero", field: "contentSchema" },
    { kind: "layout-missing-in-source", layoutId: "landing-page" },
  ]
}
```

The UI uses these to render a clear "Cannot push because…" message.

Rationale for blocking rather than auto-resolving: block definitions and layouts are defined in user code and synced to each environment by the SDK at runtime. A mismatch means the user has deployed code changes to one environment but not the other. The fix is to deploy, not to paper over the gap during replication — silently wiping prod's `block_definitions` with dev's would land content prod's renderer can't render.

### Snapshot + Apply Algorithm

One service function: `replicateEnvironment(ctx, { projectId, sourceEnvName, targetEnvName })`. Push is `source=development, target=production`; pull is the reverse. Same code path.

**Phase 0 — Authorize & resolve.** `getAuthorizedProject` against `ctx.user`. Resolve both env rows. Refuse if source and target are the same env.

**Phase 1 — Compatibility check.** Run the check above. If incompatible, throw `ORPCError("FAILED_PRECONDITION", { data: { reasons } })` so the studio can render the list.

**Phase 2 — Snapshot source.** One read pass over the source environment, collecting all rows into a single in-memory JSON object keyed by table:

```ts
type Snapshot = {
  schemaVersion: 1;
  takenAt: number;
  source: { envId: number; envName: string };
  layouts: Layout[];
  blockDefinitions: BlockDefinition[];
  files: File[];
  pages: Page[]; // includes source parentPageId / layoutId
  blocks: Block[]; // includes source pageId / layoutId
  repeatableItems: RepeatableItem[]; // includes source blockId / parentItemId
};
```

Write the JSON to R2 under `{projectId}/env-snapshots/{targetEnvName}/{timestamp}.json` **before** mutating anything in the target. This is the rollback path: if the apply phase fails partway through, restore is "run the apply phase again against this JSON, with target wiped first." We don't build a restore UI in v1; the JSON existing is enough to recover by hand.

**Phase 3 — Wipe target.** In a `db.batch()` (or sequential statements if size exceeds batch limits):

1. `DELETE FROM pages WHERE environment_id = $target` → cascades to page-blocks → cascades to their repeatable_items.
2. `DELETE FROM layouts WHERE environment_id = $target` → cascades to layout-blocks → cascades to their repeatable_items.
3. `DELETE FROM block_definitions WHERE environment_id = $target`.
4. `DELETE FROM files WHERE environment_id = $target`. The refcount check in `deleteFile` doesn't apply here because we're going to re-insert the same blobIds in phase 4 — the blobs need to survive. We bypass the per-row delete service and issue the raw `DELETE` directly inside the replication service for this reason. (The "do not delete the R2 blob" property is preserved by virtue of not calling `FILES_BUCKET.delete` here at all.)

**Phase 4 — Insert in dependency order, with ID remapping.** Maintain `Map<sourceId, targetId>` for each table that has incoming FKs: layouts, block_definitions, files, pages, blocks. Insert in this order:

1. **Layouts** — assign new ids, record in `layoutsMap`.
2. **Block definitions** — assign new ids. (No incoming FK, but we still track the map for symmetry.)
3. **Files** — assign new ids, copy `blobId` verbatim, record in `filesMap`.
4. **Pages** — sort by depth (`fullPath.split("/").length`), then iterate root-first. For each: remap `parentPageId` via `pagesMap`, remap `layoutId` via `layoutsMap`, insert, record in `pagesMap`. Sorting by depth guarantees the parent is always already inserted by the time we get to a child.
5. **Blocks** — for each: remap `pageId` via `pagesMap` (if set), remap `layoutId` via `layoutsMap` (if set), rewrite all `{ "_fileId": <sourceId> }` markers in `content` and `settings` JSON via `filesMap`, insert, record in `blocksMap`.
6. **Repeatable items** — sort by parent depth (items with no `parentItemId` first, then recursively by depth in the item tree). For each: remap `blockId` via `blocksMap`, remap `parentItemId` via the running items map, rewrite `_fileId` markers, insert.

The `_fileId` rewrite is a small recursive walk over the JSON tree (same shape as `cleanFileReferences` / `containsFileRef` in `files/service.ts`) but doing `id → filesMap.get(id) ?? id` instead of nulling. Lives in a new helper `apps/api/src/lib/remap-file-references.ts` so both replication and any future migration tooling can share it.

**Phase 5 — Broadcast invalidation.** Send a project-wide invalidation via `broadcastInvalidation` so any open studio session on the target env refetches. The session viewing the source is unaffected.

### Concurrency, Atomicity, Failure

- **Replication is not transactional.** D1 `batch()` is atomic per call but caps statement count; a wipe + reinsert of a real site will need multiple batches. Mid-flight failure can leave the target torn.
- **The R2 snapshot is the recovery path.** Manual re-apply is the v1 answer. If this happens in practice, build a restore UI.
- **No env-level lock.** Per the user's direction, mid-push edits against the target are out of scope for v1; if it happens, the snapshot covers us.
- **Workers CPU time.** Replication of a large project may approach Worker limits. We don't preemptively chunk in v1 — if a real project hits the limit, we'll move to a job-queue model (Durable Object + status polling). The snapshot makes that migration safe.

### What Stays the Same

- File upload, R2 key scheme, `/files/serve/*` route, `files.replace` semantics — unchanged.
- `resolveEnvironment` with `autoCreate` — still the path that materializes a dev env on first request.
- All existing services (pages, blocks, layouts, block-definitions, repeatable-items) — untouched. Replication reads and writes through Drizzle directly, not through service functions, because service functions enforce per-row authorization and invalidation that would be redundant and slow at this scale.
- The cascade-delete behavior on `blocks` and `repeatable_items` — relied on by phase 3.

### UI: EnvironmentMenu Only

**File**: `packages/sdk/src/features/studio/components/EnvironmentMenu.tsx`.

The popover gains two `Button`s, rendered only when `authCtx.environmentName !== "production"` (push/pull from the dev side only; users on prod can switch to dev to act):

```
[ Push to production → ]
[ ← Pull from production ]
```

On popover open, the component fires `env.checkCompatibility({ projectId, sourceEnvName, targetEnvName })` once for each direction (or one combined query returning both directions' status). Buttons render in one of three states:

- **Enabled** — compatible. Clicking opens a confirmation dialog: _"Replace all content in production with the current dev environment? This cannot be undone."_ with the counts (pages, blocks, files) computed from the source. Confirm → call `env.replicate`, show progress, close on success.
- **Disabled + explanation** — incompatible. Inline text below the button explains the first reason in human form:
  > Cannot push: block type **pricing-table** exists in dev but not in production. Deploy your code to production to add it, then try again.
- **Loading** — while the compatibility check is in flight, buttons are disabled with a spinner.

Compatibility is recomputed when the popover reopens. No real-time subscription — block-definition edits are rare and the cost of the check is one or two queries.

No UI on the production popover for v1. Prod stays informational ("You are viewing the production environment.").

No CLI surface in v1.

### Implementation Phases

**Phase 1 — Refcount-aware file deletion.** Modify `deleteFile`, `deleteFiles`, `replaceFile` in `apps/api/src/domains/files/service.ts` to check `files_blob_id_idx` before calling `FILES_BUCKET.delete`. Ships alone — it's correct independent of push/pull and unlocks the rest. Tests: delete a file that has a duplicate row → blob stays; delete the last row → blob goes.

**Phase 2 — Replication service.** New domain `apps/api/src/domains/environments/`:

- `service.ts` — `checkCompatibilityInput`, `replicateEnvironmentInput` schemas; `checkCompatibility` and `replicateEnvironment` functions.
- `routes.ts` — two `authed` oRPC procedures wiring the service.
- Register in the oRPC router alongside other domain procedures.

New helper: `apps/api/src/lib/remap-file-references.ts` — the recursive `_fileId` rewriter.

New helper: `apps/api/src/lib/stable-stringify.ts` — deterministic JSON for schema comparison.

**Phase 3 — UI in `EnvironmentMenu`.** Hook into the new procedures, wire confirmation dialog (reuse `Dialog` from `@camox/ui`), render the three button states. Update the placeholder copy that promises this feature.

**Phase 4 — Snapshot retention.** R2 writes accumulate. Add a small lifecycle rule (R2-side) or a manual cleanup procedure that keeps the last N=5 snapshots per env. Not blocking for v1.

### Open Questions

- **Snapshot size.** A content-heavy project's snapshot could be many megabytes of JSON. R2 PUT handles this fine; in-memory aggregation inside the Worker may not for very large sites. If we hit a limit, stream the snapshot directly to R2 in chunks (one table per part), and stream-read on apply. Defer until a real project demonstrates the need.
- **AI job rows.** The `ai_jobs` table is keyed by `(entityTable, entityId)` and is not env-scoped. After replication, jobs that referenced source-env ids will dangle (entity may or may not exist in any env). Today they fail silently in their executor; that's fine. Worth a sweep eventually.
- **`aiSeoEnabled` / `aiMetadataEnabled` flags.** Copied verbatim. We do **not** auto-rerun generation on the target after a push — the source's generated text comes along with the row. If the user wants regeneration on prod, they trigger it manually.
- **`syncSecret` on `projects`.** Project-level, not env-level. Untouched by replication.
- **Pushing while a draft/publish system exists.** When the draft/publish plan (`plans/draft-publish.md`) lands, "the live pointer" and "checkpoints" become per-page state that lives in the per-env data. Replication will copy them naturally because they're stored in env-scoped tables. Worth a re-read pass once both designs are concrete to make sure the snapshot includes checkpoint rows and the live-pointer column.
