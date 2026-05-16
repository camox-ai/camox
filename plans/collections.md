# Collections

Introduce a `createCollection` API plus collection-aware extensions to `createLayout` and the block field types. Assumes [consistent-field-apis](./consistent-field-apis.md) has landed — `Type.X` and `block.X` are paired, no `multiple` option, `Type.Repeater` in place.

## `createCollection`

Lean: id + schema. No rendering, no path, no layout.

```ts
const posts = createCollection({
  id: "posts",
  title: "Posts",
  description: "Blog posts",
  schema: {
    title: Type.String(),
    slug: Type.String(),
    body: Type.String(),
    cover: Type.Image(),
    publishedAt: Type.Date(),
  },
});
```

Returns `Collection<S>` carrying the TypeBox schema in a generic. `EntryOf<typeof posts>` resolves to `Static<S>`.

Schema fields use the same `Type.*` builders as blocks — any field type valid in a block is valid in a collection (scalars, `Image`, `File`, `ImageList`, `FileList`, `Link`, `Embed`, `Repeater`). `Type.CollectionRef` / `Type.CollectionList` are **not** valid inside a collection schema (no nested collections in v1).

## `createLayout` — entry overload

Second overload, picked when `collection` is passed. Existing plain-layout signature unchanged.

```ts
createLayout({
  id: "post-page",
  collection: posts,
  path: (entry) => `/blog/${entry.slug}`,
  where: (entry) => entry.publishedAt <= new Date(),   // optional filter
  blocks: {
    before: [
      navbar,
      bindBlock(postHeader, {
        title: (e) => e.title,
        image: (e) => e.cover,
      }),
    ],
    after: [footer, relatedPosts],
    initial: [bodyBlock],
  },
  component: ({ children, entry }) => <article>…{children}…</article>,
  buildMetaTitle: ({ entry, projectName }) => `${entry.title} | ${projectName}`,
  buildOgImage:   ({ entry }) => <OgImage title={entry.title} image={entry.cover} />,
});
```

Type-level invariants enforced by the overload:

- `path` required iff `collection` set
- `entry` appears in `component` / `buildMetaTitle` / `buildOgImage` ctx iff `collection` set
- `pageMetaTitle` removed from entry-layout ctx (entry pages derive their title)
- Return type `EntryLayout<S>` discriminated from `PageLayout` via runtime `kind: "page" | "entry"`

Multiple entry layouts may claim the same collection; each materializes its own page per entry. `pages.fullPath` uniqueness catches collisions at insert.

## `bindBlock`

Used inside `before` / `after` / `initial` of entry layouts to wire a block's content fields to entry fields. Each field is either a static value (existing block content) or `(entry) => value`.

```ts
bindBlock(postHeader, {
  title: (e) => e.title, // proxy-recorded path → JSON
  image: (e) => e.cover,
  subtitle: "Latest from the blog", // static, unchanged
});
```

Lambdas never execute at runtime — they're proxy-recorded into `{ $entry: ["title"] }` tokens, serialized into the block's stored content, resolved server-side in `getPageByPath` before returning. Field types and entry paths are TS-checked.

`bindBlock` is type-erased to `Block` so the return slots into the same `before`/`after` arrays as unbound blocks. Block authors don't know they're being bound.

## Block field types for referencing collections

New field types, matching the naming rule from consistent-field-apis:

```ts
Type.CollectionRef({ collection: posts, default?: entryId })
Type.CollectionList({
  collection: posts,
  source?: "manual" | { latest: number } | { oldest: number },
  default?: entryId[],
})
```

`source: "manual"` (default) → editor handpicks entries in the studio.
`source: { latest: 5 }` → server resolves 5 most recently created entries at fetch time.
`source: { oldest: N }` → mirror.

Stored in block content as `{ $collectionRef: entryId }` or `{ $collectionList: { source, entryIds? } }` tokens. Resolved server-side in `getPageByPath` to the full entry data, same pipeline as `_fileId`.

Block component side, matching the `Type.X` / `block.X` pairing:

```tsx
component: ({ content }) => (
  <>
    <block.CollectionRef field={content.featured}>
      {(entry) => <FeaturedCard entry={entry} />}
    </block.CollectionRef>

    <block.CollectionList field={content.recent}>
      {(entry) => <PostCard entry={entry} />}
    </block.CollectionList>
  </>
);
```

The render-prop `entry` is typed from the collection bound in the schema.

## DB additions

```sql
-- new
collections (
  id, projectId, environmentId,
  collectionId text,                 -- e.g. "posts"
  title, description,
  schema text,                       -- JSON (TypeBox)
  created_at, updated_at,
  UNIQUE(projectId, environmentId, collectionId)
)

collection_entries (
  id, collectionId FK,
  data text,                         -- JSON, conforms to collection.schema
  position text,                     -- fractional index
  summary text,                      -- AI-generated, optional
  created_at, updated_at,
  INDEX(collectionId)
)

-- additive columns
layouts.collectionId        -- nullable FK → collections
layouts.pathBuilder         -- nullable JSON (serialized path spec)
layouts.entryFilter         -- nullable JSON (serialized `where`)

blocks.bindings             -- nullable JSON ({ field: { $entry: [...path] } })

pages.collectionId          -- nullable FK
pages.collectionEntryId     -- nullable FK
```

No changes to existing constraints. `blocks.pageId XOR layoutId` stays as-is.

## API surface

```
collections.list(projectId)
collections.get(id)
collections.sync(projectSlug, syncSecret, definitions[], autoCreate?)

collectionEntries.list(collectionId, { limit?, offset? })
collectionEntries.get(id)
collectionEntries.create(collectionId, data)
collectionEntries.update(id, data)
collectionEntries.updatePosition(id, afterPosition?, beforePosition?)
collectionEntries.delete(id)
```

`pages.getByPath` extended to resolve `$entry`, `$collectionRef`, `$collectionList` tokens in block content before returning. No new endpoint for entry-page rendering — the materialized `pages` row handles routing.

## Sync flow

`syncLayouts` payload gains optional `collection`, `pathBuilder` (serialized form), `entryFilter`, and per-block `bindings`. CLI walks `createLayout` returns, detects entry layouts via `kind === "entry"`, serializes path/filter lambdas via the proxy recorder, ships them.

New `syncCollections` endpoint mirrors `syncLayouts` / `syncBlockDefinitions`: idempotent upsert keyed by `(projectId, environmentId, collectionId)`. Schema-altering syncs (incompatible field type changes) require explicit confirmation flag; entries are migrated lazily on next read.

## Materialization

On `collectionEntries.create`:

1. Find all `layouts WHERE collectionId = entry.collectionId AND (entryFilter is null OR matches(entry))`.
2. For each, compute `fullPath = layout.pathBuilder(entry)`.
3. Insert a `pages` row with `layoutId`, `collectionId`, `collectionEntryId`, `fullPath`.
4. Seed `initial` blocks as page-owned blocks (existing flow).

On `collectionEntries.update`:

- Re-run path builders; update any `pages.fullPath` whose builder references a changed field.
- Re-evaluate `entryFilter`; create/delete pages as needed.

On `collectionEntries.delete`: cascade-delete materialized pages (FK).

On layout sync where `collectionId` changes: re-materialize affected entry pages.

## Studio rules

- Layout picker for manually-created pages filters `collectionId IS NULL`.
- Entry layouts appear inside the collection's detail view, not the global Layouts list.
- `setPageLayout` rejects if target page has `collectionEntryId` non-null, or if layout has `collectionId` non-null.
- Collection entry CRUD lives at `Collections > {collection} > Entries`. Materialized pages are read-only from the Pages list (show "from collection" badge, link back to entry).

## Out of scope for v1

- Nested collections (`CollectionRef` inside collection schemas)
- Redirects on slug change
- Per-collection custom queries beyond `latest`/`oldest`/manual
- Collection-to-collection relations
- UI-defined collections (code-first only)
