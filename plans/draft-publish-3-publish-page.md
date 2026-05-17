## Phase 3 — Publish / Unpublish a Page

Part of [Draft & Publish](./draft-publish.md). Depends on [Phase 1](./draft-publish-1-schema.md) (snapshot infrastructure) and [Phase 2](./draft-publish-2-status.md) (sidebar source row, status badges). Layouts are still draft-only after this phase — they get their own publish flow in [Phase 4](./draft-publish-4-publish-layout.md).

### Scope

The user can now move a single page between draft and published states from the studio. Status flips, the public URL updates, the snapshot is taken atomically. Path edits made while drafting become public on publish, never before. Unpublish clears the live pointer and the public URL starts 404'ing; the draft is untouched.

This is the first phase that creates new checkpoints on user action (Phase 1's migration was the only checkpoint-writing event before this).

### API changes

**New procedures**

- `pages.publish(pageId)` — one transaction:
  1. Read the current draft state in the canonical snapshot shape.
  2. INSERT into `page_checkpoints` with `kind = 'auto-publish'`, `label = NULL`, `snapshot = <serialized>`, `schema_version = <current>`, `created_by = <user>`.
  3. UPDATE `pages.live_published_checkpoint_id` to the new row's id.
  4. Commit.
- `pages.unpublish(pageId)` — UPDATE `pages.live_published_checkpoint_id` to NULL. Checkpoints kept. Single statement.

Both are gated by the same editor role today. No separate publish permission yet — flagged in the overview's open questions for later.

The atomicity matters: between (2) and (3), readers must not see a checkpoint row that nothing points at if they're inspecting `page_checkpoints` directly. Wrap in a single transaction. The pointer update is the publish — that's the moment the public site changes.

**Layout-coupled publish (forward-looking)**

The procedure shape accepts an optional `alsoPublishLayout: boolean` flag — but until Phase 4 ships the layout side, the flag is rejected (or silently false) and the dialog's checkbox is never shown. Mentioning it here so the API shape doesn't change between Phase 3 and Phase 4.

### Studio changes (`apps/web`)

**Sidebar row — add the Publish… button**

The sidebar row from Phase 2 (Live content switch + PagePicker) gets a **Publish…** button on the right side of the same row. Pairing them reflects that both operate on the page currently in focus: the switch chooses _what am I looking at_, the button promotes that draft to public.

The button is enabled when the page is `draft` or `modified`. Disabled (or relabeled) when `published`.

**Publish dialog**

Click **Publish…** opens a small confirmation dialog:

- The page handle and current path.
- The post-publish URL (= the draft path; same as current unless the user changed it).
- A primary **Publish** button.

That's all for now. The "Also publish layout _regular-page_ (affects 12 pages)" checkbox is wired in Phase 4 once layouts can publish.

**Page-menu Unpublish action**

A new entry in the page-row menu (the same menu that holds rename/duplicate/delete today): **Unpublish**. Click → confirmation dialog noting "The public URL `/path` will start returning 404. Your draft is preserved." → confirm → call `pages.unpublish`.

Disabled on pages that are already in `draft` status (nothing to unpublish).

### Cache / invalidation

The crucial observation: **published state never mutates piecewise**. A publish atomically swaps the live pointer; nothing else changes it. So per-block invalidation against `'live'` is a code path that never fires. After a publish, the studio invalidates the entire `'live'` namespace for the affected page and re-seeds from the new snapshot — one wholesale refetch, not N individual ones.

| Event             | Targets `'draft'` keys | Targets `'live'` keys                                                        |
| ----------------- | ---------------------- | ---------------------------------------------------------------------------- |
| Publish page      | none                   | `pages.getByPath(path, 'live')` + all `blocks.get(id, 'live')` for that page |
| Unpublish page    | none                   | `pages.getByPath(path, 'live')` for that page (will return null → 404)       |
| Page list refresh | n/a                    | n/a — page list invalidation fires anyway because the status flipped         |

Page-list invalidation already exists from Phase 2 (it watches status changes). Publish/unpublish both trigger it through the normal mutation-success path.

### Path / slug behavior

The public router matches against the live checkpoint's snapshot path, not the draft path. Concretely:

- User edits a draft's path from `/about` to `/about-us`. Public site keeps serving `/about` from the current live checkpoint; `/about-us` 404s.
- User clicks Publish. New checkpoint is created with `fullPath: '/about-us'`. Pointer flips. Public site now serves `/about-us`; `/about` 404s.

No special path-handling code in the publish procedure — this falls out naturally from the snapshot containing `fullPath` and the public router reading from snapshots (Phase 1).

### UX walkthroughs

**Creating and publishing a new page**

1. User creates a page. It exists as a draft (`live_published_checkpoint_id = NULL`). Public URL 404s. Status badge says **Draft**.
2. User edits blocks. Status stays **Draft** (no live pointer to compare against).
3. User clicks **Publish…**, confirms in the dialog. First checkpoint is created. Live pointer set. Status badge becomes **Published**. Public URL serves the page.

**Editing a published page**

1. User edits a block on a published page. Status flips to **Modified**. Public URL still serves the previous version.
2. The Live content switch in the sidebar lets the user flip between draft and live previews without leaving the editor — same render, different data source.
3. User clicks **Publish…**, confirms. New checkpoint created, live pointer updated. Status flips back to **Published**.

**Unpublishing**

1. User clicks **Unpublish** in the page menu. Confirmation dialog notes the public URL will start 404'ing.
2. Confirm → live pointer cleared. Draft untouched. The previous `auto-publish` checkpoint stays in the DB and can be re-pointed-at later, once the history sidebar ships.

### How to verify before moving on

- **First publish.** Create a fresh page, edit some blocks, click Publish. Public URL renders the published content. Page list shows **Published**.
- **Edit-then-publish.** On a published page, change a block. Page flips to **Modified**. Click Publish. Page flips to **Published**, public URL now reflects the change.
- **Path change.** Edit a published page's path. Public site keeps serving the old path; new path 404s. Publish. New path live, old path 404s.
- **Unpublish.** Confirm dialog fires. After confirming, public URL 404s. Status badge becomes **Draft**. Draft preview still renders. Re-publish brings the page back (new checkpoint written; the old one is now stranded in history with no UI to reach it — fine, it's there for when the history sidebar ships).
- **Concurrency sanity.** Two rapid publishes don't end up with the pointer at the earlier checkpoint. Transaction ordering handles this — verify with a quick stress test if it feels at risk.
- **Layout still draft-only.** Editing a layout block on a published page leaves the page's `modifiedReason` showing layout cascade from Phase 2. Click Publish on the page — the layout part is _not_ published; the page's modified-because-of-layout state persists. This is correct and is what Phase 4 fixes.

### What's explicitly out of scope for this phase

- Publishing layouts (Phase 4).
- "Publish All" view (Phase 5).
- Restore-to-live / restore-to-draft. Both depend on a UI to pick a non-latest checkpoint, which doesn't exist without the history sidebar.
- Manual checkpoints (Save checkpoint button). Same dependency.
- The "Also publish layout" checkbox in the publish dialog — wired in Phase 4.
