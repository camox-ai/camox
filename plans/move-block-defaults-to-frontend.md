# Move block defaults generation to the frontend

## Problem

Block creation splits default generation across client and server:

- **Client** (`getInitialContent`): generates scalar defaults (strings, booleans, enums), sends them as `content` in the create API call
- **Server** (`createDefaultRepeatableItems`): reads the synced schema from `blockDefinitions` table, generates repeatable items in the DB

This is problematic because:

1. **Inconsistent source of truth** — the client JS block definition is the authority for scalar defaults, while the server's synced-and-possibly-stale copy of the schema is the authority for repeatable item defaults. If the schema sync is stale, the server creates items based on an outdated schema.
2. **Duplicated logic** — the frontend already knows how to generate the full picture (scalar content + repeatable items + nested repeatables) via `getPeekBundle` / `buildPeekItems`. The server has its own parallel implementation in `createDefaultRepeatableItems`. Both must be kept in sync.
3. **Same problem exists for single-item creation** — `repeatableItems.create` also calls `createDefaultRepeatableItems` to auto-create nested child items from the synced schema.

## Design

Move all defaults generation to the frontend. The client already builds complete bundles for peeking — extend this to be the single source of truth for block creation too.

### New API: `block.getInitialBundle()`

Replace `getInitialContent()` and `getPeekBundle()` with a single `getInitialBundle()` method:

```ts
getInitialBundle(): {
  content: Record<string, unknown>;       // block content (scalars + _itemId markers for repeatables)
  settings: Record<string, unknown>;      // settings defaults
  repeatableItems: RepeatableItemSeed[];  // all items to create (flat list, with parentage)
}
```

Where `RepeatableItemSeed` is:

```ts
interface RepeatableItemSeed {
  tempId: string; // client-generated temp ID (for parent references)
  parentTempId: string | null; // references another seed's tempId (for nested items)
  fieldName: string;
  content: Record<string, unknown>;
  position: string;
}
```

The temp IDs are opaque strings used only to express parent–child relationships within the seed list. The server assigns real IDs.

`getPeekBundle()` becomes a thin wrapper that calls `getInitialBundle()` and reshapes the output for the `NormalizedDataProvider` (fake IDs, fake timestamps, etc.).

### Changes

#### 1. SDK — `createBlock.tsx`

- Add `getInitialBundle()` using the existing `buildPeekItems` logic (adapted to produce `RepeatableItemSeed` objects with string temp IDs instead of fake numeric IDs).
- Rewrite `getPeekBundle()` to call `getInitialBundle()` internally and dress the seeds up as `PeekItem` objects with fake numeric IDs.
- Deprecate `getInitialContent()` — keep it as `() => getInitialBundle().content` for backward compat during transition, but strip repeatable-related fields from it (it already does this via `contentDefaultsForStorage`).

#### 2. API — `blocks.ts` create handler

Expand the `createBlockSchema` to require a `repeatableItems` array (empty array when there are none):

```ts
const createBlockSchema = z.object({
  pageId: z.number(),
  type: z.string(),
  content: z.unknown(),
  settings: z.unknown().optional(),
  afterPosition: z.string().nullable().optional(),
  repeatableItems: z.array(
    z.object({
      tempId: z.string(),
      parentTempId: z.string().nullable(),
      fieldName: z.string(),
      content: z.unknown(),
      position: z.string(),
    }),
  ),
});
```

In the handler:

- Insert the provided `repeatableItems` in topological order (parents before children), building a `tempId → realId` map to resolve `parentTempId` references.
- Remove the `createDefaultRepeatableItems` call and the function itself.

#### 3. API — `repeatable-items.ts` create handler

Same pattern. Expand the `createItemSchema` to require a `nestedItems` array (empty array when there are none):

```ts
const createItemSchema = z.object({
  blockId: z.number(),
  parentItemId: z.number().nullable().optional(),
  fieldName: z.string(),
  content: z.unknown(),
  afterPosition: z.string().nullable().optional(),
  nestedItems: z.array(
    z.object({
      tempId: z.string(),
      parentTempId: z.string().nullable(), // null = child of the item being created
      fieldName: z.string(),
      content: z.unknown(),
      position: z.string(),
    }),
  ),
});
```

Insert `nestedItems` resolving the parent being created as the root. Remove the `createDefaultRepeatableItems` call from this handler.

#### 4. SDK — `AddBlockSheet.tsx`

Update `handleAddBlock` to use `getInitialBundle()`:

```ts
const bundle = block.getInitialBundle();
const { id: blockId } = await createBlock.mutateAsync({
  pageId: page.page.id,
  type: block.id,
  content: bundle.content,
  settings: bundle.settings,
  afterPosition,
  repeatableItems: bundle.repeatableItems,
});
```

Update the optimistic `onMutate` to also use the bundle for seeding the cache with realistic repeatable items (instead of `repeatableItems: []`).

#### 5. SDK — `RepeatableItemsList.tsx`

When adding a single repeatable item that has nested repeatable children, generate the nested seeds client-side and send them via the new `nestedItems` field.

#### 6. SDK — `PeekedBlock.tsx`

Use `block.getInitialBundle()` → adapt to `PeekItem` shape (already done internally by the new `getPeekBundle` wrapper). No visible change.

#### 7. SDK — `definitionsSync.ts`

Replace `block.getInitialContent()` with the content portion of `getInitialBundle()`. The `defaultContent` stored in the definitions table should match what would actually be persisted on the block row (scalars only, no `_itemId` markers).

This means `defaultContent` stays as scalar-only content (current `contentDefaultsForStorage` behavior). No change needed if we keep `getInitialContent()` as an alias.

### Cleanup

- Delete `createDefaultRepeatableItems` from `blocks.ts` entirely.
- Remove its import from `repeatable-items.ts`.
- `getInitialContent()` remains available but delegates to `getInitialBundle().content` (filtered to storage-safe fields).
- No database migration needed.

### AI page generation

AI page generation creates blocks through the same `blocks.create` API but constructs content from LLM output, not from defaults. It must be updated to also send `repeatableItems` in its create calls. If the AI doesn't generate repeatable content, it should send an empty array.
