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

### Never-Published Pages

A page that has never been published has `livePublishedCheckpointId = NULL`. The public router returns 404 for that path. The page is only visible inside the studio (via the draft toggle). The first publish creates the first checkpoint and points the live pointer at it.

### Restoring a Checkpoint Into the Draft (deferred)

When the user picks an old checkpoint and clicks **Restore to draft**, we overwrite the live rows with that snapshot. Before doing so, we auto-create a `manual` checkpoint labeled _"Before restore (auto)"_ so the user's in-flight work isn't lost. The mental model stays simple — draft is always a single linear state, with the safety net of an auto-checkpoint right before any destructive operation.

We're explicitly not introducing branching drafts (multiple named draft branches per page). It's a much larger UX surface and the value isn't clear at this stage.

This action is gated by the history sidebar UI and is out of v1 scope. See [What's Deferred](#whats-deferred).

### Forward Compatibility: Collection Entries

Collections ship after D&P (see [collections.md](./collections.md)). Entries — the JSON data rows that will drive entry layouts and `$collectionRef` / `$collectionList` blocks — will land as their own publishable surface, mirroring pages and layouts: a `collection_entries` live row, a `collection_entry_checkpoints` table, a `live_published_checkpoint_id` pointer, a `content_updated_at` timestamp. Entries are not part of D&P v1, but a few design decisions are pinned now so the seam is clean when they land.

**The entry resolver is source-parameterized.** Block content keeps its `$entry` / `$collectionRef` / `$collectionList` tokens through snapshots — same rule as `_fileId` and `_itemId` markers, never inlined to values. A single resolver function takes `(token, source)` and consults different state per source:

- `source: 'live'` → each referenced entry's current `live_published_checkpoint_id`. **Composable**: publishing an entry immediately updates every published page referencing it. Matches how files resolve today.
- `source: 'draft'` → entries' live row data. Editor preview of all in-flight content.
- `source: { checkpointId }` on a page → entries pinned to the checkpoints they were on when this page checkpoint was created (see entry-refs map below). Historical views render coherently.

In v1 the resolver has nothing to resolve — collection tokens don't exist yet. It's introduced as the stable seam so the entry case later lands as a single call-site change in `pages.getByPath`, not a re-plumbing.

**Page snapshots reserve an `entryRefs` field.** When entries land, the page snapshot picks up an optional `entryRefs: { [entryId]: checkpointId }` map captured at publish time — IDs only, no entry data. `source: 'live'` ignores it (composable); `source: { checkpointId }` consults it (pinned-in-time). Tiny per page, absent on pages without entry refs. v1 page snapshots don't write the field; the `schema_version` ratchet absorbs the addition.

**Status semantics don't change.** A page being "modified" remains driven by its own and its layout's `content_updated_at`. Entry edits won't flip page status — entries will surface their own pending-changes signal in the collections UI. A derived "this page's public render is showing newer entry content than at its last publish" badge, if wanted later, is a presentation overlay computed at list time, not a status-column rule.

**Materialized pages (pages backed by an entry layout + entry) publish like any other page**, with one constraint at first publish: the bound entry must already be published, or the publish dialog offers publish-entry-and-page as a combined action. After first publish, page and entry have independent lifecycles.

**Null-resolution contract.** `pages.getByPath` on a published page referencing a never-published entry resolves that token to null; the renderer surfaces a broken-binding placeholder (concrete UX TBD). Contract: no exception, no fallback to draft data on a public read.

### Phased Build

The work is split into five testable phases. Each phase is independently mergeable and produces something you can poke at end-to-end before the next one starts.

1. [Phase 1 — Snapshot plumbing, no behavior change](./draft-publish-1-schema.md). Tables, columns, `source` parameter, migration. Public site reads switch to snapshots; studio still draft-only. Nothing visible to users.
2. [Phase 2 — Status badges and Draft/Live preview toggle](./draft-publish-2-status.md). Derived status, page-list badge, sidebar source select. Read-only; no publish actions yet.
3. [Phase 3 — Publish / Unpublish a page](./draft-publish-3-publish-page.md). `pages.publish` and `pages.unpublish`, publish dialog, page-menu unpublish, cache invalidation.
4. [Phase 4 — Publish / Unpublish a layout, cascading status](./draft-publish-4-publish-layout.md). Same for layouts. "Modified because of layout X" tooltip. "Also publish layout" option in the page publish dialog.
5. [Phase 5 — Publish All](./draft-publish-5-publish-all.md). Project-level batch publish view.

After Phase 5, v1 ships. The history sidebar — and everything that depends on it — stays deferred.

<a id="whats-deferred"></a>### What's Deferred (Not v1)

- **History sidebar.** Browsing a page's or layout's checkpoint history is deferred. The publish flow still creates `auto-publish` checkpoints (that's how the live pointer has anything to point at), they just have no UI surface. Schema, `kind` enum, and the snapshot pipeline are all in v1; only the sidebar component and its dependent actions are out.
- **Manual (`Save checkpoint`) and restore actions.** Both **Restore to draft** and **Restore to live** depend on a UI to pick a checkpoint, which doesn't exist without the sidebar. `kind = 'manual'` rows are never written in v1. The "safety-net checkpoint before restore" logic moves with restore itself.
- **Checkpoint deletion.** Same dependency.
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
