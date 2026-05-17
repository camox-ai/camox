## Phase 2 — Status Badges and Draft/Live Preview Toggle

Part of [Draft & Publish](./draft-publish.md). Depends on [Phase 1](./draft-publish-1-schema.md) being shipped (the snapshot read path and `content_updated_at` columns).

### Scope

Surface the data Phase 1 already produces, read-only. The user can now see which pages are modified, and can flip between draft and live previews for any page they're editing. No way to publish yet — that's Phase 3. Status is computed, never stored.

### Status derivation

Status is derived per page at read time, not stored:

- `live_published_checkpoint_id IS NULL` → **draft** (never been public — only possible for pages created after Phase 1 ships, since the migration sets it on every existing page).
- Pointer set, `page.content_updated_at <= checkpoint.created_at` _and_ `layout.content_updated_at <= layout_checkpoint.created_at` → **published**.
- Pointer set, but either timestamp has advanced → **modified**.

This is a single timestamp compare per page in any list query. No row scanning.

For the page list endpoint, the comparison joins on the live checkpoint row to get its `created_at` — one extra join, but the index on `(page_id, created_at DESC)` already covers the lookup. Same for layouts on the cascade side.

### API changes

**Page list shape gains `status`**

The page-list procedure returns a `status: 'draft' | 'published' | 'modified'` field on each page. For modified pages it also returns a small `modifiedReason` discriminator:

- `'self'` — the page's own `content_updated_at` is newer than its live checkpoint.
- `'layout'` — only the layout has moved past its checkpoint. Include the layout's id/handle and the count of pages the layout affects, for the Phase 2 tooltip.
- `'both'` — both.

Same shape for a single-page read (`pages.getByPath` already gets the data it needs; just add the field to the return type).

No new procedures in this phase. The `source` parameter from Phase 1 is already in place.

### Studio changes (`apps/web`)

**Page-list badge**

Render the status as a small badge in the page list. Three states, three colors — match whatever the studio's existing badge primitive is. The "modified because of layout X (affects N pages)" tooltip surfaces `modifiedReason` when relevant.

**"Live content" switch in the sidebar**

A single `Switch` labeled "Live content" in the studio sidebar, immediately beside the `PagePicker` and above its divider — the same row that will host the **Publish…** button in Phase 3. The switch chooses _what am I looking at_:

- Off (default) — studio reads with `source: 'draft'`. Today's behavior.
- On — studio reads with `source: 'live'`. Shows the user what visitors currently see. Disabled on never-published pages.

Both states render through the same component — only the loader's `source` argument differs. This is the user-facing payoff of Phase 1's shape-identity property.

The current source is held in the page-editor state and threaded into every read in that page view (the `pages.getByPath` call and the seeded per-block reads from `seedBlockCaches`).

**Read-only while previewing Live.** Block mutations always land on the draft, but allowing edits to fire silently while the user is staring at the Live snapshot is too confusing — the canvas wouldn't reflect what just changed. So while `previewSource !== 'draft'`:

- `isContentLocked` is forced to `true` (the existing toolbar/L-key lock). Its prior value is remembered and restored on return to draft. The user can't manually toggle the lock — the PreviewToolbar button and the `L` shortcut are both disabled.
- In-canvas overlays disappear (the existing `useIsEditable` plumbing already gates on `isContentLocked`).
- Every external edit entry point (PageTree drag/click, PageContentSheet inputs, AddBlockSheet, `useBlockActionsShortcuts`, repeater add/remove, iframe-forwarded `CAMOX_ADD_BLOCK_REQUEST`) calls a `useRequireDraftSource()` gate. If source is `'draft'` it proceeds; otherwise it opens a "Switch to draft to edit?" `AlertDialog` (`DraftSwitchDialog`, mounted once in `CamoxPreview`). The dialog's only CTA flips `previewSource` to `'draft'` — the original edit attempt is **not** replayed; the user re-issues the edit themselves once they're on draft.
- Distinction from manual lock: when `isContentLocked` is true _while on draft_, shortcuts/actions stay silent (today's behavior). When `isContentLocked` is true _because_ source ≠ draft, the same paths open the dialog instead. `checkIfAvailable` discriminates with `ctx.isContentLocked && ctx.previewSource === 'draft'`.

### Cache / invalidation

This phase introduces a second cache namespace per page (`'draft'` and `'live'`), but no event in v1 yet causes the `'live'` keys to invalidate piecewise. They're only seeded on first read, then cached. After Phase 3 ships publish, the wholesale invalidation on publish is what refreshes them.

| Event                                | Targets `'draft'` keys                              | Targets `'live'` keys |
| ------------------------------------ | --------------------------------------------------- | --------------------- |
| Block content/settings/position edit | `blocks.get(id, 'draft')` for the affected block(s) | none                  |
| Block create / delete / duplicate    | `blocks.get(...)` + page list (draft)               | none                  |
| Toggle Live content switch           | nothing (just a render-side state flip)             | nothing               |

The page list itself needs to invalidate (or refetch) on any edit that could flip a status — i.e. on any draft mutation that bumps `content_updated_at`. Cheap because status is a derived field on an already-cached query; standard React Query invalidation.

### How to verify before moving on

- **Every existing page reads as "Published"** in the page list after a freshly-migrated DB, regardless of which environment or layout.
- **Edit a block → page flips to "Modified" within one query tick.** Status badge updates in the page list.
- **Layout cascade.** Edit a block belonging to a layout, every page using that layout flips to "Modified" with the `modifiedReason: 'layout'` tooltip and the correct affected-pages count.
- **Toggle Live content.** With the switch on, the preview shows the snapshot version (i.e. the state before your edits). With it off, your in-flight changes. Switching is instant — both sources are React-Query cached.
- **Overlays vanish on Live.** Toggling Live on hides every in-canvas editing overlay. The PreviewToolbar lock button and the `L` shortcut are both disabled (tooltip explains why).
- **Edit attempt while Live opens dialog.** With Live on, every edit path opens the "Switch to draft to edit?" dialog: PageContentSheet inputs (click anywhere in the form area), PageTree drag attempt and grip/ellipsis click, "Add block" button, keyboard shortcuts (Cmd+⌫, Cmd+D, Alt+↑/↓, O, Shift+O). Cancel keeps Live and no mutation runs. Confirm flips source to Draft — the original edit attempt is **not** replayed.
- **Manual lock vs source lock are distinct.** With source = Draft, manually pressing `L` toggles the lock and silences shortcuts (existing UX). With source = Live, the same shortcuts open the dialog instead of being silent.
- **Lock state preserved across Live round-trip.** Manually lock on Draft → toggle Live → toggle back to Draft: the manual lock is restored. Manually-unlocked starting state → Live → back to Draft: the user returns to an editable state.
- **Never-published page.** Create a new page (no publish UI exists yet — do it via the API directly, or temporarily through a test script). Page list shows it as "Draft". Live content switch is disabled. The public site 404s on its path (already true from Phase 1).

### What's explicitly out of scope for this phase

- No publish or unpublish action — read-only feature. Cannot flip a page out of Modified yet.
- No history listing, no checkpoint browsing — the index exists, no UI reads it.
- No "Publish All" view.
- No per-checkpoint preview yet. Live preview reads the live pointer; arbitrary-checkpoint preview ships with the history sidebar.
