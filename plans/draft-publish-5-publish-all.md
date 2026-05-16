## Phase 5 — Publish All

Part of [Draft & Publish](./draft-publish.md). Depends on [Phase 4](./draft-publish-4-publish-layout.md) — both `pages.publish` and `layouts.publish` need to exist before this view is meaningful.

### Scope

A single project-level view that lists every modified page and every modified layout in the current environment with a checkbox per item, and a primary action that publishes the selected set. This is the "ship a release" workflow — users batching multiple intentional edits together rather than publishing one item at a time.

After Phase 5 ships, v1 is complete.

### API changes

**New procedure: `project.listModified`**

Returns the list of modified pages and modified layouts in the current project + environment. Lightweight payload — just enough to render the list:

- Per page: id, handle, current path, `modifiedReason` (`'self' | 'layout' | 'both'`), and if `'layout'` or `'both'` the affected layout's id/handle.
- Per layout: id, handle, count of pages using it.

This is the same status compare the page-list query already does (Phase 2) — filter to `status = 'modified'` and reshape. Could even be an existing-query parameter rather than a new procedure; pick whichever fits the contract style better.

**New procedure: `project.publishMany({ pageIds, layoutIds })`**

Publishes the selected set in a single logical action. Implementation choice:

- **One transaction per item.** Simpler, more failure-tolerant (a failure on item 7 doesn't roll back items 1–6). The UI reports per-item success/failure. Recommended.
- **One transaction for everything.** Tempting for atomicity but means a single bad row blocks the whole batch; on a 50-item publish, that's a worse failure mode than "48 succeeded, 2 reported errors, retry those".

Go with per-item transactions. Each item calls into the existing `pages.publish` or `layouts.publish` internals — no new write path, just a fan-out.

Order matters slightly: if both a layout and a page using that layout are in the same batch, publish the layout first so the page's resulting status is `published` rather than `modifiedReason: 'layout'`. The procedure should sort the input that way (layouts before pages that depend on them) before iterating. Cycles aren't possible (pages reference layouts, not the other way around).

### Studio changes (`apps/web`)

**Project-level "Publish all" entry point**

Somewhere in the project chrome — likely a button near the environment switcher or in a project-level menu — surface a **Publish all…** action. Badge it with the count of modified items if you want; otherwise just a static label.

**The view**

A modal or full-page view with two sections:

- **Pages** — every modified page with a checkbox, the handle, the path, and a small icon/text for `modifiedReason` (so the user can tell "I edited this page" from "the layout caused this").
- **Layouts** — every modified layout with a checkbox, the handle, and "(affects N pages)" alongside.

All checkboxes default to **checked** — the common case is "I want to ship everything that's pending". Users opt out of items they're not ready for.

Primary action button: **Publish selected (N items)**. Disabled when nothing is checked.

After the action completes, the view shows a per-item result list (success / failure with the error message) and lets the user close or retry failed items. Don't auto-close on completion — the user wants to see what happened.

### Cache / invalidation

Each item's publish triggers its own existing wholesale invalidation (Phase 3 for pages, Phase 4 for layouts). The page-list query refetches once after the batch completes — debouncing N consecutive invalidations into one refetch is a normal React Query concern, not something this phase invents.

### How to verify

- **Empty state.** With no modified items, the view shows "Nothing to publish. Everything is up to date." and the primary action is absent (or disabled).
- **Mixed batch.** Modify two pages and one layout used by both. Open Publish all. All three items appear, all checked. Confirm. All three publish; the layout is processed before the pages so their final status is `published`, not `modified-because-layout`.
- **Partial selection.** Uncheck the layout, leaving the two pages. Publish. Pages publish; their status flips to `modifiedReason: 'layout'` because the layout is still modified. This is correct.
- **Per-item failure isolation.** With a test fixture that forces one item to fail, the others still publish successfully. The view shows a clear per-item result.
- **Order independence.** The user's checkbox order in the UI doesn't affect outcome — the server sorts layouts before dependent pages.

### What's explicitly out of scope for this phase

- Cross-environment batch publish ("promote everything modified in dev to prod"). Cross-environment publishing isn't part of v1 at all — see overall deferral list.
- Scheduled / delayed publish ("publish this batch at 9am tomorrow").
- Per-item diff preview from inside the view. The data exists; the diff UI is its own project.

### After v1

With Phase 5 shipped, the v1 set is complete. The history sidebar, manual checkpoints, restore-to-draft / restore-to-live, checkpoint deletion, auto-draft checkpoints, file GC, signed preview URLs, branching drafts, per-checkpoint diffs, and cross-environment publishing all remain deferred — see the [What's Deferred](./draft-publish.md#whats-deferred) section in the overview. The schema and read-path infrastructure shipped in Phase 1 are designed so each of those features is an additive layer, not a refactor.
