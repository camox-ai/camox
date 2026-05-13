## Draft & Publish

### Goal

Today, every edit a user makes in the studio is instantly visible to public visitors. We want a workflow where users can iterate on changes privately and only make them public when they choose to — and where they can revisit, label, and roll back to previous states of any page or layout.

The reference model is Strapi 5's draft-and-publish: a page is one of **draft**, **published**, or **modified** (published, but with unpublished changes on top). On top of that, Camox introduces **checkpoints** — a generalized history primitive that subsumes "the published version" and also lets users save labeled snapshots while drafting.

### Current State

- Every entity (`pages`, `blocks`, `layouts`, `repeatable_items`, `files`) is a single live row. There is no status, no version, no snapshot.
- The public renderer and the studio read from the exact same query (`pages.getByPath`).
- Layout blocks are **shared by reference**: one row in `blocks` with `layoutId` set, used by every page bound to that layout. They are not cloned per page.
- Files are project + environment-scoped and referenced by ID from block content. They have no relationship to any individual page.
- Environments (prod / dev) exist as a tenancy split, but both environments are equally "live" — they are not a draft-and-publish mechanism.

### Core Concept: Checkpoints

There are exactly three things in the new model:

1. **Draft** — the live rows in `pages`, `blocks`, `repeatable_items`, `layouts`. This is what the studio mutates. It is what the user is working on.
2. **Checkpoints** — immutable snapshots of a page (or a layout). A checkpoint contains everything needed to render that page/layout at the moment it was taken. Checkpoints come in three flavors:
   - `auto-publish` — created automatically when the user clicks **Publish**.
   - `manual` — a save point a user creates explicitly while drafting ("before-redesign", "v1-pre-launch", etc.). Does not affect the public site.
   - `auto-draft` — automatic safety nets (e.g. created on a schedule, or before a destructive restore). Off by default for v1; we just want the column to support them later.
3. **The "live" pointer** — a single field on each page (and each layout) saying _which checkpoint is currently public_. Nothing else needs to be marked "published".

**Publishing** = create an `auto-publish` checkpoint, atomically point the live pointer at it.
**Unpublishing** = clear the live pointer. The checkpoint history is preserved.
**Rolling back the public site** = repoint the live pointer at an older checkpoint. The draft is untouched.
**Rolling back the draft** = overwrite the live rows with an older checkpoint's snapshot. The public site is untouched until the next publish.

Checkpoints are the _only_ history primitive. "The published version" is just "the checkpoint that the live pointer points at". This is the key simplification: we don't have a separate "published" concept that competes with checkpoints.

### Why Snapshots, Not Dual Rows

A tempting alternative is a `status` column on every row (`draft` / `published`) with two parallel copies, à la Strapi internals. We're rejecting it for two reasons:

1. **The user explicitly wants seamless toggling between draft and published previews, with no divergence in rendering code.** A snapshot model lets us define a single canonical `PageView` shape that both the live-row query and the snapshot parser produce. The renderer never knows which source it got. With a dual-row model, every query path would need to filter on status, and "preview an arbitrary historical checkpoint" requires the versioned-table approach anyway.
2. **Checkpoints generalize cleanly.** The same snapshot mechanism backs publish, manual save points, and (eventually) auto-saves. We get history "for free" instead of bolting it on later.

### Status: Derived From Timestamps, Not Stored

A page's status (**draft** / **published** / **modified**) is computed at read time:

- No live pointer set → **draft** (never been public).
- Live pointer set, page content has not changed since that checkpoint, _and_ the page's layout content has not changed since _its_ live checkpoint → **published**.
- Live pointer set, but either the page or its layout has moved on → **modified**.

To make this cheap, the page and layout rows each carry a `contentUpdatedAt` timestamp that is bumped on every block / repeatable-item mutation. Status is then a single timestamp compare per page in any list query. No row scanning.

### Layouts: Independent Publishables That Cascade Status

A layout is its own publishable unit, with its own checkpoint history and live pointer. Editing a layout block does not flag the layout — but its `contentUpdatedAt` advances.

Because a page's rendered output depends on both the page and its layout, a page is **modified** if _either_ its own content or its layout's content has moved past their respective live checkpoints. In the studio UI we surface this distinction clearly: "This page is modified because the layout _regular-page_ has unpublished changes (affects 12 pages)."

This means a layout edit silently puts every page using that layout into "modified" status, which matches the user's actual reality — what visitors see post-publish depends on both.

### The Publish Dialog: Optionally Bundles the Layout

When the user clicks **Publish** on a page:

- Default: publish just this page (creates an `auto-publish` checkpoint, repoints the page's live pointer).
- If the page's layout is also modified, the dialog shows a clearly-labeled checkbox: _"Also publish layout regular-page (affects 12 pages)"_. Unchecked by default.

This gives the user explicit control. Most of the time they're publishing one page's edits; occasionally a page edit is paired with a layout edit they did at the same time and want to publish together. We don't auto-couple because that would surprise users who edited the layout intentionally separately.

A "Publish All" action at the project level surfaces every modified page and every modified layout, with checkboxes per item.

### Files

Files do not get draft / published state. They are addressable storage; what matters is whether a _block in a published checkpoint_ references them.

- A file uploaded during a draft session exists in the project file pool from the moment of upload. Its blob URL is technically reachable to anyone with the URL, but it is not linked from any public page until that draft is published.
- Snapshots store file references by ID, exactly as live rows do. The renderer resolves IDs to URLs at read time — same code path for draft and checkpoint sources.
- `files.replace` operates on **live rows only**. Checkpoints are immutable history; replacing a file in the past would defeat the purpose of having that history. If a user wants the replacement reflected publicly, they publish.
- `files.delete` should eventually warn if any checkpoint (live or not) references the file. **File garbage collection is explicitly out of scope for v1.** We'll watch how files accumulate in practice and add tooling later.

### Path / Slug Changes While Drafting

A page's `fullPath` lives on the page row (the draft) and is also captured into each checkpoint's snapshot.

- The public router matches against the **live checkpoint's** snapshot path, not the draft path.
- Editing a draft's path therefore does not move the public URL until the next publish. The old URL keeps serving the old content; the new URL 404s until publish.
- After publish, the new URL is live and the old one 404s.

This avoids "phantom routes" where a half-edited draft path leaks onto the public site, and keeps the rule simple: _public URLs only change on publish_.

### Restoring a Checkpoint Into the Draft

When the user picks an old checkpoint and clicks **Restore to draft**, we overwrite the live rows with that snapshot. Before doing so, we auto-create a `manual` checkpoint labeled _"Before restore (auto)"_ so the user's in-flight work isn't lost. The mental model stays simple — draft is always a single linear state, with the safety net of an auto-checkpoint right before any destructive operation.

We're explicitly not introducing branching drafts (multiple named draft branches per page). It's a much larger UX surface and the value isn't clear at this stage.

### Never-Published Pages

A page that has never been published has `livePublishedCheckpointId = NULL`. The public router returns 404 for that path. The page is only visible inside the studio (via the draft toggle). The first publish creates the first checkpoint and points the live pointer at it.

### UX Walkthroughs

**Creating a new page**

- User creates a page. It immediately exists as a draft. Public URL 404s.
- User edits blocks. Status badge says "Draft".
- User clicks **Publish**. First checkpoint is created. Live pointer set. Status badge becomes "Published". Public URL serves the page.

**Editing a published page**

- User edits a block on a published page. Status flips to "Modified". Public URL still serves the previous version.
- A "Preview" toggle in the studio header lets the user flip between _Draft_ and _Published_ without leaving the editor — same render, different data source.
- User clicks **Publish**. New checkpoint created, live pointer updated. Status flips back to "Published".

**Editing a layout**

- User opens the _regular-page_ layout in the layout editor, tweaks the navbar.
- The layout's status flips to "Modified".
- Every page using _regular-page_ now shows "Modified" with a tooltip explaining the layout caused it.
- User publishes the layout: every affected page's status recomputes, and most flip back to "Published".

**Manual checkpoints**

- While drafting, user clicks **Save checkpoint** in the page menu, enters a label ("Before homepage redesign").
- A manual checkpoint is created. Public site is unaffected (the live pointer didn't move).
- Later, user wants to undo recent changes: open the history sidebar, click the checkpoint, choose **Restore to draft**. Confirmation dialog explains that current draft will be auto-saved as a "Before restore" checkpoint. Draft rows are overwritten.

**Rolling back what's public**

- User regrets the last publish. Opens the history sidebar, finds the previous `auto-publish` checkpoint, chooses **Restore to live**. The live pointer is repointed. Draft is untouched. Public site instantly serves the older version.

**Sharing a draft for review**

- (Future work.) Generate a signed preview URL pointing at the draft version of a page. Recipient can open the URL without studio credentials. Not in v1 scope — we just want the model to support it (`pages.getByPath` already accepts a `source` parameter; the URL just needs to carry one).

### Database Implications

This section describes how the model lands in storage and how reads/writes change. Implementation details (exact column types, transaction code) are left for the implementation pass.

**New tables**

- `page_checkpoints(id, page_id, kind, label, snapshot, schema_version, created_at, created_by)`
- `layout_checkpoints(id, layout_id, kind, label, snapshot, schema_version, created_at, created_by)`

`kind` is one of `auto-publish | manual | auto-draft`. `snapshot` is a JSON blob in a TEXT column. `schema_version` is a one-way ratchet so we can evolve the snapshot shape later — older snapshots are read through a migration function, new ones are written at the current version. `created_by` is the user id; nullable for system-created checkpoints. Indexed on `(page_id, created_at DESC)` (resp. `(layout_id, created_at DESC)`) for history listing.

**New columns**

- On `pages`: `live_published_checkpoint_id` (nullable FK), `content_updated_at` (timestamp).
- On `layouts`: same two columns.

The pointer is what makes a page "live" — no extra status table or status column anywhere else.

**How a snapshot is stored**

The `snapshot` column holds a JSON blob whose shape is **identical to what `pages.getByPath` already returns from live rows**: `{ page, blocks, repeatableItems }` for a page; `{ layout, blocks, repeatableItems }` (with `placement: 'before' | 'after'` per block) for a layout. Blocks keep their `_itemId` markers in content; repeatable items are listed separately and resolved back in by the client, exactly as today. File references stay as `{ _fileId }` markers in content; the renderer resolves IDs against the live `files` table at read time, identical code path to draft mode.

This shape-identity is the load-bearing property of the design: it means `(source: 'live' | 'draft' | { checkpointId }) → PageView` is a single contract, and the renderer doesn't branch on source. Rendering a published page is one row read on `pages`, one row read on `page_checkpoints`, one `JSON.parse`, then the existing render pipeline. A page snapshot does _not_ contain its layout's blocks — `page.layoutId` references the layout, and the layout's own live checkpoint provides the layout half. Composition `page snapshot + layout snapshot` happens at the page-fetch level, the same way `live page rows + live layout rows` already compose in `getByPath` today.

**Write patterns**

- **Draft edits** (the hot path): unchanged from today. Mutations write to `pages` / `blocks` / `repeatable_items` / `layouts` live rows. The single additional cost is one extra UPDATE bumping the parent page's or layout's `content_updated_at` — this is what makes status a single-timestamp compare instead of a row scan.
- **Publish**: one transaction. INSERT a row into `page_checkpoints` (or `layout_checkpoints`) with the serialized current state as `snapshot` and `kind = 'auto-publish'`, then UPDATE `pages.live_published_checkpoint_id` (or `layouts.live_published_checkpoint_id`) to the new id. Atomic.
- **Manual checkpoint**: same INSERT, no UPDATE. The live pointer doesn't move.
- **Restore to draft**: one transaction. First INSERT an `auto-draft` / `manual` checkpoint of the current draft (the "Before restore (auto)" safety net), then overwrite live rows from the chosen snapshot. This is more write-heavy than a publish because it touches every row of the page (and its repeatable items). But it's a rare action and a single per-page transaction.
- **Restore to live**: UPDATE the pointer only. No row touched on `blocks` / `repeatable_items`. Effectively instant.
- **Unpublish**: UPDATE the pointer to NULL. Checkpoints kept.

**Read patterns: draft is granular, published is wholesale**

This is the key invariant for fitting checkpoints into the existing per-block React Query cache.

Today, after the initial `pages.getByPath`, the studio's `seedBlockCaches` (`packages/sdk/src/lib/normalized-data.ts:174`) populates one cache entry per block keyed `blocks.get(id)`. Mutations (`updateContent`, `updatePosition`, etc.) emit invalidation events targeting only those per-block keys — and the corresponding refetch hits `blocks.get(id)` on the API, which is a real per-block endpoint (`apps/api/src/domains/blocks/service.ts:595`). That granular path is the hot path and we want to preserve it intact.

- **Draft reads** (`source: 'draft'`) — today's joined queries against live tables. Per-block refetch via `blocks.get(id, 'draft')` is unchanged. Granular invalidation continues to work block-by-block. This is the hot path during editing.
- **Published / checkpoint reads** (`source: 'live'` or `{ checkpointId }`) — one row read on `pages` / `layouts`, one row read on the checkpoints table, one `JSON.parse`. The bundle returned has the _same shape_ as a draft read, so `seedBlockCaches` populates per-block entries from snapshot data using the same code.

The crucial observation: **the published state never mutates piecewise.** The only event that changes "what's published" is a publish, which atomically swaps the live pointer. There is no `updatePublishedBlockContent`. So per-block invalidation against the `'live'` source is a code path that never fires in normal operation. After a publish, the studio invalidates the entire `'live'` namespace for the affected page (and any pages affected by a layout publish) and re-seeds from the new snapshot — **one wholesale refetch, not N individual ones**.

`blocks.get(id, source)` is plumbed for symmetry and future deep-link scenarios (history sidebar showing "this block in this old checkpoint"). When `source` is `'live'` or `{ checkpointId }`, it locates the parent (page or layout) by id, reads its snapshot, extracts the block. Mildly wasteful (parses N KB to return one block's worth) but never the hot path.

Invalidation summary:

| Event                                | Targets `'draft'` keys                              | Targets `'live'` keys                                                                                                  |
| ------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Block content/settings/position edit | `blocks.get(id, 'draft')` for the affected block(s) | none                                                                                                                   |
| Block create / delete / duplicate    | `blocks.get(...)` + page list (draft)               | none                                                                                                                   |
| Publish page                         | none                                                | `pages.getByPath(path, 'live')` + all `blocks.get(id, 'live')` for that page                                           |
| Publish layout                       | none                                                | `pages.getByPath` + `blocks.get` under `'live'` for every page using that layout, plus the layout's own published keys |
| Restore checkpoint → draft           | all draft keys for that page (wholesale)            | none                                                                                                                   |
| Restore checkpoint → live (repoint)  | none                                                | all `'live'` keys for that page (wholesale)                                                                            |
| Save manual checkpoint               | none (history list only)                            | none                                                                                                                   |

Net effect: draft invalidation stays as granular as today; published invalidation is always wholesale-per-page; publishes are infrequent compared to keystrokes, so the wholesale cost is negligible.

**Migration of existing data**

For each existing page: serialize its current state into a snapshot, INSERT an `auto-publish` checkpoint, point `live_published_checkpoint_id` at it. Same for each existing layout. Result: no visible change for visitors; every page starts life "published" and users can start drafting from there. `content_updated_at` is initialized to the row's `updated_at`.

**Storage growth**

A typical page snapshot is a few KB to a few tens of KB (blocks are small, items embed by reference). One snapshot per publish per page, plus voluntary manual checkpoints. No pruning in v1 — keep everything, revisit when real usage data exists. If/when `auto-draft` ships, that's where retention rules become necessary first.

**Referential integrity**

`page_checkpoints.page_id` and `layout_checkpoints.layout_id` cascade-delete (deleting a page drops its history with it — there's no orphan-history concept). `live_published_checkpoint_id` is a nullable FK with `ON DELETE SET NULL` defensively, though in practice we never delete the row currently pointed at; the studio prevents it.

**What's not changed at the DB level**

- `blocks`, `repeatable_items`, `files`, `block_definitions` schemas — untouched. All four continue to hold live (draft) state.
- Environments — untouched. Checkpoints live under their parent page/layout, which is already environment-scoped via FK chain.
- Fractional indexing — untouched. Snapshots store position strings as-is.

### Pieces Affected

**API layer (`apps/api`)**

- New tables: `page_checkpoints`, `layout_checkpoints`.
- New columns: `pages.livePublishedCheckpointId`, `pages.contentUpdatedAt`, mirrored on `layouts`.
- New service: checkpoint creation, restore, publish, unpublish. Atomic transactions for publish (insert checkpoint + repoint pointer).
- `pages.getByPath` and `layouts` reads gain a `source` parameter (`'live' | 'draft' | { checkpointId }`).
- All block / repeatable-item mutations bump the parent page's or layout's `contentUpdatedAt`.
- `files.replace` and `files.delete` semantics revisited (the former touches live rows only; the latter eventually warns on checkpoint references, deferred).

**API contract (`packages/api-contract`)**

- New procedures: `pages.checkpoints.{list, create, publish, unpublish, restore, delete}`, mirrored under `layouts.checkpoints`.
- Existing read procedures gain the `source` parameter.
- Page list shape gains a `status` field (`'draft' | 'published' | 'modified'`).

**SDK runtime (`packages/sdk`)**

- The page loader (used by the deployed site) calls `getByPath` with `source: 'live'`. If null → 404.
- The studio's preview loader calls with `source: 'draft'` or a specific checkpoint id.
- Critically: the rendering path is identical for both. Only the loader's `source` argument differs.

**Studio (`apps/web`)**

- Status badge on every page in the page list.
- Per-page **Publish** button and dialog (with optional "also publish layout" checkbox).
- Per-layout **Publish** button.
- Preview toggle (Draft / Published / pick-a-checkpoint).
- History sidebar listing checkpoints with kind, label, date, author; actions to **Restore to draft**, **Restore to live**, **Delete** (can't delete the currently-live one).
- **Save checkpoint** action (manual checkpoint, with label input).
- Project-level **Publish all** view listing every modified page and layout with checkboxes.
- UI explanation for "modified because of layout" state.

**Template / public-facing site (`apps/template-default`, deployed sites)**

- No code change required: the SDK switches its loader to `source: 'live'` and downstream rendering is unchanged. This is the property that justifies the snapshot model — it falls out of the design.

### What's Deferred (Not v1)

- **Auto-draft checkpoints.** Schema supports the `auto-draft` kind, but we don't create any on a schedule yet.
- **File garbage collection.** Surface "only referenced by drafts" / "only referenced by historical checkpoints" badges later, once usage tells us whether it matters.
- **Signed preview URLs** for sharing drafts with non-editors. The `source` parameter on the read path makes this trivial to add later; the UI and auth piece is the actual work.
- **Branching drafts.** Single linear draft per page, full stop.
- **Per-checkpoint diffs in the UI** (showing what changed between two checkpoints). The data is all there; the diff UI is its own project.
- **Cross-environment publishing.** Today, prod and dev environments are independent; that stays. Promoting a checkpoint from dev → prod is a separate feature.

### Open Questions

- **How many checkpoints do we retain?** Forever feels right for `manual` and `auto-publish`; if we ever add `auto-draft`, those need pruning rules. Defer until we ship auto-draft.
- **Who can publish vs. who can save a manual checkpoint?** Probably both gated by the same "editor" role today, with publish potentially behind a separate permission later. Not pressing in v1.
- **Restore-to-live: confirmation flow.** Should we always show a diff preview before repointing the live pointer, or trust the user to know what they're picking? Lean toward "show the public URL and the checkpoint date prominently, but don't require diff". Refine during build.
- **Status recomputation on layout publish.** A layout publish needs to invalidate the status of every page using it (cache-wise). Cheap because status is derived, but the studio's page-list query needs to know to refetch. Standard query invalidation; just noting the dependency.
