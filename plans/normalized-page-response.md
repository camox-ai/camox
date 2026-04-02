## Normalized Page Response & Granular Caching

### Problem

The current page content assembly in `apps/api/src/routes/pages.ts` is complex and type-unsafe:

- Repeatable items are fetched separately then merged back into block content via `reconstructBlockContent`
- File references (`_fileId`) are resolved by recursively walking the content tree twice (collect, then resolve)
- File data is denormalized — stored both in the `files` table and duplicated inline in block/repeatable-item content JSON as `{ url, alt, filename, mimeType, _fileId }`
- Heavy `Record<string, unknown>` casting throughout, no runtime validation after assembly
- Assembly logic is duplicated across `getByPath`, `executePageSeo`, `getPageMarkdown`
- The frontend caches at page-level, so any block edit refetches the entire page

### Goal

1. **Fully normalized storage** — block/repeatable-item content stores `{ _fileId }` marker objects for file references and `{ _itemId }` markers for repeatable-item references, not inline data
2. **API returns normalized data** — no recursive assembly, no tree-walking
3. **Frontend caches each entity individually** — block edits only refetch that block
4. **New single-entity endpoints** for granular refetching

---

### New Response Shape

```ts
// GET /pages/getByPath
{
  page: { id, title, path, fullPath, ..., blockIds: number[] },
  layout: { id, layoutId, beforeBlockIds: number[], afterBlockIds: number[] } | null,
  blocks: [{ id, type, position, placement?, content: { /* scalars + { _fileId } / { _itemId } markers */ } }],
  repeatableItems: [{ id, blockId, fieldName, position, content: { /* scalars + { _fileId } markers */ } }],
  files: [{ id, url, alt, filename, mimeType }],
}
```

The `blocks` array includes **both page blocks and layout blocks**. Layout blocks are distinguished by having a `placement` field (`"before"` | `"after"`). The `page.blockIds` and `layout.beforeBlockIds` / `layout.afterBlockIds` arrays reference into the same `blocks` array.

Key principles:

- `blocks[].content` keeps scalar fields as-is, but files are `{ _fileId: number }` marker objects (e.g. `heroImage: { _fileId: 42 }`) and top-level repeatable fields are arrays of repeatable item ID markers (e.g. `testimonials: [{ _itemId: 7 }, { _itemId: 8 }]`)
- `repeatableItems[].content` same — files are `{ _fileId }` markers, and nested repeatable fields are arrays of `{ _itemId }` markers. All repeatable items live in the same flat `repeatableItems` array regardless of nesting depth
- `files` is a flat array of all file objects referenced anywhere in the page (from page blocks, layout blocks, and repeatable items)
- The API does **no recursive resolution** — it queries each table and returns rows
- No more `{ url, alt, filename, mimeType, _fileId }` inline objects in content — content stores only `{ _fileId: number }`
- The `{ _markerKey: id }` pattern (used for both `_fileId` and `_itemId`) avoids ambiguity with regular numeric fields and is easy to detect without schema knowledge

### Marker object pattern

All entity references in content use a `{ _key: id }` marker object pattern:

| Reference type                | Stored as                           | Detected by                 |
| ----------------------------- | ----------------------------------- | --------------------------- |
| File (single)                 | `{ _fileId: 42 }`                   | `"_fileId" in obj`          |
| File (multiple, inline array) | `[{ image: { _fileId: 42 } }, ...]` | Same, nested in array items |
| Repeatable item (Phase 2)     | `{ _itemId: 7 }`                    | `"_itemId" in obj`          |

This pattern is consistent, unambiguous (no conflict with regular numbers/objects), and detectable without content schema knowledge.

---

## Phase 1: Normalize File Storage ✅ DONE

**Goal:** Block and repeatable-item content stores `{ _fileId }` marker objects instead of inline file objects. The current read path (`getByPath`) continues to work by resolving markers to full objects at read time.

**Testable at the end:** The app works identically — pages render, images display, editing works. The only difference is what's stored in the `content` JSON column.

### What was implemented

**1a. `parentItemId` on `repeatableItems` table**

- Added nullable `parentItemId` column + index to `repeatableItems` schema
- Migration: `0002_amazing_enchantress.sql`
- Backend `create` mutation accepts `parentItemId` as alternative to `blockId` (resolves `blockId` from parent chain)
- Backend `delete` cascades to descendant items via `deleteDescendants` helper
- `updatePosition` and `duplicate` filter siblings by same parent level
- Read path: `nestChildItems()` reconstructs nested items from flat DB rows into parent content; `groupItemsByBlockAndField` and `reconstructBlockContent` filter by `parentItemId === null` for top-level only

**1b. File write path — `{ _fileId }` markers**

- `SingleAssetFieldEditor`: writes `{ _fileId: N }` on upload/select, `null` on unlink
- `MultipleAssetFieldEditor`: completely rewritten — manages inline `[{ image: { _fileId: N } }]` arrays in block content via `onFieldChange`, no longer creates repeatable items. Supports drag-and-drop reorder, add, remove, select from picker.
- `contentType.ts`: `ImageValue`/`FileValue` types no longer have `_fileId` property. Multiple image/file defaults changed to `[]` (empty array). `defaultItems` count stored in schema for frontend placeholder generation.

**1c. File read path — `{ _fileId }` resolution**

- `collectFileIds`: detects `{ _fileId }` markers via `"_fileId" in obj && obj._fileId != null`, handles both string and number values
- `resolveFileRefs`: replaces `{ _fileId: N }` with `{ url, alt, filename, mimeType, _fileId: N }` from file map lookup. Recurses into arrays (both DB-backed repeatable items with `.content` wrapper and inline array items)
- No schema dependency — detection is purely structural (`"_fileId" in obj`)
- `assembleBlocks`, `executePageSeo`, `getPageMarkdown` all updated

**1d. Frontend rendering**

- `createBlock.tsx` Repeater: unified handler for both DB-backed items (`{ id, content, ... }`) and inline items (plain objects). Detects format via `item.content !== undefined && item.id != null`. Generates placeholder items from `repeatableItemDefaults` when array is empty and `defaultItems > 0`.
- `Image`/`File` components: fall back to `contentDefaults` placeholder when field value is `null` (unlinked)
- `normalizeLinkValue`: guards against `null`/`undefined` values
- Breadcrumb generation for inline image arrays: uses `repeaterContext.arrayFieldName` so `PageContentSheet` correctly identifies multiple-asset fields
- `RepeatableItemsList`: removed inline mode, all items use DB mutations
- `PageContentSheet`: removed `handleNestedItemFieldChange`, all items use `handleItemFieldChange`
- `ItemFieldsEditor`: removed `parentItemId`/`parentFieldName` props

**1e. Seed data**

- `seed.ts` creates a demo file record and references it via `{ _fileId: demoFile.id }` in the hero block's `illustration` field

---

## Phase 2: Normalize the API Response ✅ DONE

**Goal:** `getByPath` returns the normalized shape (flat arrays, no assembly). The frontend still consumes it at page-level for now.

**Testable at the end:** The public page endpoint returns the new shape. The frontend renders pages correctly using the new response format.

### 2a. Refactor `getByPath`

Replace the assembly pipeline (`assembleBlocks` → `reconstructBlockContent` → `nestChildItems` → `collectFileIds` → `buildFileMap` → `resolveFileRefs`) with flat queries:

```
1. Fetch page by fullPath
2. Fetch page blocks WHERE pageId = page.id, sorted by position
3. Fetch layout WHERE id = page.layoutId (if set)
4. Fetch layout blocks WHERE layoutId = layout.id, sorted by position
5. Merge page blocks + layout blocks into a single blocks array
6. Fetch repeatableItems WHERE blockId IN (all block IDs from both page + layout), sorted by position
   — this single query returns ALL items (top-level and nested) because all items have blockId set
7. Collect file IDs by scanning all content for { _fileId } markers (no schema needed)
8. Fetch files WHERE id IN (collected file IDs)
9. Return { page (with blockIds), layout (with beforeBlockIds/afterBlockIds), blocks (combined), repeatableItems (flat, all depths), files }
```

**Note on step 7:** File ID collection is schemaless — `collectFileIds` walks content recursively and detects any `{ _fileId: N }` marker object. This works because `_fileId` is an unambiguous marker that doesn't appear in regular content.

### 2b. Normalize repeatable item references

Currently, top-level repeatable items are merged into block content arrays by `reconstructBlockContent`. In the normalized response, block content should store `{ _itemId }` marker arrays instead:

- Block content: `testimonials: [{ _itemId: 7 }, { _itemId: 8 }, { _itemId: 9 }]`
- The actual item data lives in the flat `repeatableItems` array
- Frontend resolves `_itemId` markers from the flat array at render time

**Exception — inline asset arrays:** Multiple image/file fields (e.g. `images: [{ image: { _fileId: 42 } }]`) are stored as inline arrays directly in block content, NOT as repeatable items. These are managed by `MultipleAssetFieldEditor` via `onFieldChange`. This is because asset arrays only contain file references — there's no complex per-item content that benefits from individual DB rows.

### 2c. Add single-entity GET endpoints

- **`blocks.get(id)`** — returns the block row. Also returns its repeatable items and referenced files.
- **`repeatableItems.get(id)`** — returns the item row. Also returns referenced files.

These are needed for granular refetching in Phase 3.

### 2d. Update frontend to consume normalized response

Update `PageContent`, block rendering components, and any other consumer of the `getByPath` response to work with the new shape — resolving `{ _fileId }` and `{ _itemId }` markers from the flat arrays. This is still page-level fetching, just a different response shape.

### 2e. Delete dead assembly code

Remove `assembleBlocks`, `reconstructBlockContent`, `nestChildItems`, `collectFileIds`, `buildFileMap`, `resolveFileRefs`, `groupItemsByBlockAndField`, and related helpers.

---

## Phase 3: Granular Frontend Caching ✅ DONE

**Goal:** Each block has its own query cache entry. Content/settings mutations invalidate only the affected block, not the entire page.

**Testable at the end:** Editing a block only refetches that block via `blocks.get`, not the entire page.

### What was implemented

**3a. Seed block caches from page loader**

- `seedBlockCaches()` utility in `normalized-data.ts` — takes a `PageWithBlocks` response and seeds individual block caches keyed by `queryKeys.blocks.get(blockId)`. Each cache entry stores a block bundle `{ block, repeatableItems, files }` matching the `blocks.get` endpoint shape. Items are filtered by `blockId`, files are filtered by scanning content for `_fileId` markers.
- `createPageLoader` in `pageRoute.tsx` — seeds block caches inside the `queryFn` after fetching page data. The full page response is still stored under the page key (needed by editing UI components like `PageTree`, `AddBlockSheet`, `BlockActionsPopover`).
- `PageContent` in `CamoxPreview.tsx` — re-seeds block caches synchronously whenever page data changes (handles peeked page switches and page query invalidation).

**3b. BlockRenderer subscribes to individual block cache**

- New `BlockRenderer` component in `CamoxPreview.tsx` — uses `useSuspenseQuery(blockQueries.get(blockId))` to subscribe to the individual block cache. Wraps each block in its own `NormalizedDataProvider` scoped to that block's files and repeatable items. Falls back to fetching from `blocks.get` endpoint if cache is empty.
- `PageContent` renders `BlockRenderer` wrappers instead of inline block rendering. An outer `NormalizedDataProvider` with page-level data remains for layout blocks (which still render from page data).
- `PageContentSheet` reads block data, items map, and files map from `blockQueries.get(blockId)` instead of the page query. This ensures the editing UI stays in sync with the block cache.

**3c. Granular invalidation**

Backend changes to `blocks.ts`:

- `updateContent` — invalidates `blocks.get(id)` + `blocks.getPageMarkdown` only (removed page query invalidation)
- `updateSettings` — invalidates `blocks.get(id)` + `blocks.getPageMarkdown` only (removed page query invalidation)
- `generateSummary` — added `blocks.get(id)` to existing invalidation targets
- Structural mutations (`create`, `delete`, `deleteMany`, `updatePosition`, `duplicate`) — unchanged, still invalidate page query

Backend changes to `repeatable-items.ts`:

- `updateContent` — invalidates `blocks.get(blockId)` only (removed page query invalidation)
- `updatePosition` — invalidates `blocks.get(blockId)` only
- `create`, `delete`, `duplicate` — invalidate `blocks.get(blockId)` + `blocks.getUsageCounts` (removed page query invalidation)
- `generateSummary` — invalidates `blocks.get(blockId)` + `blocks.getUsageCounts`

**Design decisions:**

- Page query still stores full `PageWithBlocks` — avoids refactoring all editing UI consumers (`PageTree`, `AddBlockSheet`, `useUpdateBlockPosition`, `BlockActionsPopover`, `Overlays`)
- Layout blocks still render from page-level data — layout editing is less frequent and the layout rendering architecture would need a separate refactor
- File mutations still invalidate page-level queries — file metadata edits are rare, and tracking which blocks reference a file would add complexity
