## Phase 4 — Publish / Unpublish a Layout, Cascading Status

Part of [Draft & Publish](./draft-publish.md). Depends on [Phase 3](./draft-publish-3-publish-page.md). Layouts already exist as independent entities with their own checkpoint table and pointer (shipped in [Phase 1](./draft-publish-1-schema.md)); this phase adds the publish/unpublish actions for them and closes the loop on the layout-cascade status that Phase 2 already surfaces in the UI.

### Scope

A layout becomes an independently publishable unit, with its own publish/unpublish actions and its own atomic transaction. The page publish dialog grows the long-promised "Also publish layout _X_ (affects N pages)" checkbox for the common case where a layout edit and page edit are intended to ship together. Status cascading — already computed and shown since Phase 2 — now has a way for the user to resolve it.

### API changes

**New procedures**

- `layouts.publish(layoutId)` — mirrors `pages.publish`. One transaction: serialize current layout draft state (the `{ layout, blocks, repeatableItems }` shape with `placement: 'before' | 'after'` per block), INSERT into `layout_checkpoints` with `kind = 'auto-publish'`, UPDATE `layouts.live_published_checkpoint_id`.
- `layouts.unpublish(layoutId)` — UPDATE the pointer to NULL.

**`pages.publish` honours `alsoPublishLayout`**

The flag introduced (but inert) in Phase 3 becomes real. When `true`:

1. In the same transaction, INSERT a `layout_checkpoints` row for the page's layout and UPDATE the layout's live pointer.
2. Then the existing page publish steps.

Atomicity matters here too: a page publish that "also publishes layout" must not commit one and roll back the other. If the page has no layout, the flag is silently ignored. If the layout isn't modified, the flag is allowed but is a no-op (writing an identical checkpoint is harmless; simpler than gating the flag).

### Studio changes (`apps/web`)

**Per-layout Publish button**

In the layout editor (and wherever layouts are listed), add a **Publish…** button that mirrors the page button. Status badge for layouts also lights up (the data was already computed in Phase 2 — just render it on layout rows too).

**Per-layout Unpublish action**

Same shape as page Unpublish: a menu entry, a confirmation dialog noting that every page using the layout will fall back to no layout (or render without it — clarify what the renderer does for a layout-pointer-NULL case; if undefined, decide and document). For most projects, unpublishing a layout is rare; this exists for symmetry.

**Page publish dialog: "Also publish layout" checkbox**

The publish dialog from Phase 3 now checks whether the page's layout is `modified`. If so, render a checkbox below the primary action:

> ☐ Also publish layout **regular-page** (affects 12 pages)

Unchecked by default. We don't auto-couple because the user may have edited the layout separately and not be ready to ship it.

If checked, the dialog calls `pages.publish(id, { alsoPublishLayout: true })`. If unchecked, the layout stays modified after the publish and the page's status will still show `modifiedReason: 'layout'` (the page's _own_ content is now caught up, but the layout isn't).

**Tooltip from Phase 2 stays**

The "modified because of layout X (affects N pages)" tooltip is already shipped. Nothing new here — but it now has an obvious path to resolution: either click the page's Publish dialog and check the box, or go to the layout itself and publish there.

### Cache / invalidation

A layout publish affects every page using that layout. The page list needs to recompute status for all of them; the per-page `'live'` caches for all of them need to refresh.

| Event                                       | Targets `'draft'` keys | Targets `'live'` keys                                                                                                  |
| ------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Publish layout                              | none                   | `pages.getByPath` + `blocks.get` under `'live'` for every page using that layout, plus the layout's own published keys |
| Unpublish layout                            | none                   | Same set as above (the cached `'live'` page reads need to re-resolve layout = null)                                    |
| Publish page with `alsoPublishLayout: true` | none                   | The page's own `'live'` keys (as in Phase 3) plus the layout-affected set above                                        |

The "every page using that layout" enumeration is a single query — `SELECT id FROM pages WHERE layout_id = ?`. Cheap.

### UX walkthrough — editing a layout

1. User opens the _regular-page_ layout in the layout editor, tweaks the navbar.
2. The layout's status flips to **Modified**.
3. Every page using _regular-page_ now shows **Modified** with the tooltip explaining the layout caused it.
4. User publishes the layout (either from the layout editor's Publish button, or by checking the box in a single page's publish dialog). Every affected page's status recomputes; pages whose own content is unchanged flip back to **Published**. Pages with their own pending edits stay **Modified** (now `modifiedReason: 'self'`).

### How to verify before moving on

- **Layout publish.** Edit a layout block. Layout flips to Modified; every dependent page flips to Modified-because-layout. Publish the layout. All dependent pages whose own content is clean flip back to Published; pages with their own pending edits stay Modified but flip from `modifiedReason: 'layout'` (or `'both'`) to `'self'`.
- **Bundled publish.** On a page where both the page and its layout are modified, open the publish dialog, check "Also publish layout". After confirming, both flip to Published in one transaction. Every _other_ page using the same layout also recomputes.
- **Bundled publish, no layout modification.** On a page whose layout is _not_ modified, the checkbox doesn't appear in the dialog.
- **Layout publish atomicity.** Force a fault in the middle of a bundled publish (e.g. a test fixture that throws between the page and layout INSERTs) — neither row is committed, the live pointers don't move.
- **Cache propagation.** Open two pages using the same layout in two browser tabs. Publish the layout from one tab. The other tab's Live preview refreshes within one query tick.

### What's explicitly out of scope for this phase

- "Publish All" project-level view (Phase 5).
- Per-layout history sidebar — same deferral as pages.
- Smart suggestion that batches layout-publish with page-publish across multiple pages (only the per-page dialog gets the checkbox; project-wide batching is Phase 5).
