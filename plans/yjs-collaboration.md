## Yjs Collaboration on Lexical Editors

### Goal

Enable real-time collaborative editing on all Lexical text fields (block content fields and sidebar editors) using Yjs, backed by the existing partyserver Durable Object infrastructure. Markdown remains the persistence format in D1; Yjs handles live sync only.

### Current State

- **Editors**: Two Lexical editor components — `InlineLexicalEditor` (inline in blocks) and `SidebarLexicalEditor` (sidebar sheet). Both use `OnChangePlugin` with 300ms debounce to convert `editorState` to **markdown** via `lexicalStateToMarkdown()` and fire HTTP mutations (`blocks.updateContent` / `repeatableItems.updateContent`). Last-write-wins, no conflict resolution.
- **Persistence format**: `blocks.content[fieldName]` and `repeatable_items.content[fieldName]` store **markdown strings** (the D1 column is typed `json` but the runtime value is a markdown string). Lexical state JSON is never persisted.
- **ExternalStateSync**: When not focused, editors accept new state from React Query cache (e.g. after invalidation). When focused, external updates are ignored to avoid clobbering the user's input.
- **PartyServer**: `ProjectRoom` Durable Object handles invalidation broadcast only — receives POST with `InvalidationEvent`, calls `this.broadcast()`. No Yjs, no state, no persistence.
- **Client connection**: `useProjectRoom` hook connects via `usePartySocket` per project. One room per project, used only for cache invalidation.
- **Dependencies**: `@lexical/react` v0.41 is installed (brings `yjs` as transitive dep). `partyserver` v0.4.1 and `partysocket` v1.1.16 are installed. `@lexical/yjs` is **not** installed and must be added.

### Architecture Decision: Yjs as Sync-Only, Markdown as Source of Truth

Yjs is used for the live editing protocol between connected clients (CRDT merge, cursors, presence). It is **not** used as the persistent format.

- D1 stores markdown, as it does today
- The `Y.Doc` lives in memory on the `EditorRoom` DO while at least one client is connected
- On first connect to an empty room, the server seeds the `Y.Doc` from the D1 markdown (markdown → Lexical state → Yjs)
- On last disconnect (and on periodic flush), the server converts current Lexical state back to markdown and writes via the existing `updateContent` mutation path
- Yjs binary state is never persisted to D1 — no new table, no schema change

Rationale:

- Keeps markdown as the canonical format. AI summaries, API exports, read-only rendering, SSR all keep working without change.
- Avoids a lossy two-format store (Yjs binary + markdown) and avoids storing binary blobs in D1.
- The markdown↔Lexical round-trip cost is paid only at room boundaries (first load, periodic flush, last disconnect), not on every keystroke.

Tradeoff: if the DO evicts before the final markdown write lands, in-flight edits are lost. Mitigation: fire the markdown write on last-disconnect synchronously before returning from `onClose`, plus a periodic flush every 30s while the room is active.

### Architecture Decision: One Room per Project+Environment, Fields as Subdocs

**One Durable Object per `(projectId, environmentName)` pair**, not one per field. Fields are multiplexed inside the room as Yjs **subdocs**.

Room naming: `{projectId}:{environmentName}` (e.g. `5:production`, `5:staging`). Environment scoping is required — block/repeatable-item IDs are globally unique across environments today, but awareness/presence, lazy subdoc loading, and AI-write resets all need to be environment-isolated so collaborators on prod don't cross-talk with collaborators on staging.

Subdoc naming: `{entityType}:{entityId}:{fieldName}` (e.g. `block:42:title`, `repeatableItem:17:description`). The client binds `CollaborationPlugin` to a subdoc by this id.

Rationale:

- **1 WebSocket per client** instead of ~60 per page. A viewer on a page with 20 blocks × 3 Lexical fields would otherwise open 60 sockets.
- Subdocs are Yjs's first-class solution for multi-doc multiplexing — lazy-loaded, independently synced, independently flushable. `@lexical/yjs` `CollaborationPlugin` already supports targeting a specific shared type / subdoc by id.
- Natural home for project-wide awareness ("who's in the project and where are they editing") — presence works across the whole project without extra plumbing.
- The DO stays "warm" while anyone is on the project, but only holds subdocs for fields that have been subscribed to. Idle fields cost nothing in memory.

**Merge with the existing `ProjectRoom`**: invalidation and collaboration live in the same DO. This means the room key moves from `{projectId}` to `{projectId}:{environmentName}` for both paths. Today's invalidation is project-scoped only; env-scoping it alongside is a small pre-existing improvement that falls out for free.

### Room Lifecycle

1. Client mounts a collaborative editor → opens a WebSocket to `/parties/project-room/{projectId}:{environmentName}` (or reuses the existing one — only one connection per project+env per tab)
2. Client binds `CollaborationPlugin` to the subdoc id `{entityType}:{entityId}:{fieldName}`. This sends a subdoc-subscribe message over the existing socket.
3. On first subscribe to a given subdoc: server fetches the markdown value from D1, converts to Lexical state, seeds the subdoc. On subsequent subscribes, sync handshake runs against the in-memory subdoc.
4. Yjs sync protocol runs per-subdoc over the shared WebSocket.
5. Periodic flush (every 30s while the DO is active): for each dirty subdoc, convert current Lexical state → markdown → write to D1 via existing mutation. Clear the dirty flag.
6. On last client disconnect: flush all dirty subdocs synchronously, fire invalidation for the flushed fields, then allow the DO to idle out.
7. Durable Object evicted after inactivity — no binary state to persist.

A subdoc with no subscribers can be dropped from memory early (after a final flush if dirty) without tearing down the whole DO.

### Data Flow Change

**Before (current):**

```
User types → Lexical onChange (300ms debounce) → lexicalStateToMarkdown() → HTTP POST updateContent → D1 write → broadcast invalidation → other clients refetch
```

**After (with Yjs sync-only):**

```
User types → Yjs subdoc update → WebSocket to ProjectRoom DO (subdoc-routed) → broadcast to other clients subscribed to that subdoc → Lexical updates via Yjs binding

Persistence: ProjectRoom periodic flush + on last-disconnect → for each dirty subdoc, convert Lexical state to markdown → updateContent → D1 write → invalidation broadcast for non-subscribed clients
```

The client no longer calls `blocks.updateContent` directly for Lexical fields — the `ProjectRoom` does, using the same mutation. Non-collaborative writes (AI-generated content, API imports) still go through the mutation path unchanged; they also need to reset the in-memory subdoc for that field (if any) so connected clients don't overwrite the AI output on the next flush.

### Implementation Plan

#### Phase 1: Extend `ProjectRoom` with Yjs Collaboration

**Modify `apps/api/src/durable-objects/project-room.ts`**

- Keep the existing `broadcastInvalidation` method — unchanged behavior for non-collaborative writes
- Hold a `Map<string, Y.Doc>` of active subdocs keyed by `{entityType}:{entityId}:{fieldName}`, plus a `Set<string>` of dirty subdoc ids
- On first subscribe to a subdoc id: resolve `(projectId, environmentName)` → `environmentId`, fetch the markdown from `blocks.content[fieldName]` or `repeatable_items.content[fieldName]` for that env, convert markdown → Lexical JSON → seed the subdoc via `@lexical/yjs` helpers
- On subsequent subscribes: run Yjs sync handshake against the in-memory subdoc
- On `onMessage`: route by subdoc id, apply Yjs update, mark subdoc dirty, broadcast to other clients subscribed to the same subdoc
- On `onClose` (last subscriber for a subdoc): flush if dirty, then drop from memory
- On DO-level last disconnect: flush all dirty subdocs synchronously, fire invalidation for each flushed field, allow the DO to idle
- Periodic alarm (every 30s while any subscriber is connected): flush dirty subdocs, keep the DO warm

**Room keying**: rooms are addressed as `{projectId}:{environmentName}`. The existing `ProjectRoom` invalidation callers (`apps/api/src/lib/broadcast-invalidation.ts` and its callers in `ai-job-scheduler.ts`, route handlers) must be updated to pass `environmentName` alongside `projectId`. The client `useProjectRoom` hook must accept and include `environmentName` in the room key.

**No new D1 table.** Markdown stays in the existing `content` JSON column.

**Wrangler config**: no new DO binding needed (reusing `ProjectRoom`). Migration tag bump only if the class's durable storage shape changes — if the DO remains stateless across restarts (all state is in-memory ephemeral), no migration needed.

**Auth**: reuse the same `onBeforeConnect` pattern — validate session before allowing WebSocket upgrade. Authorize the connecting user against both `projectId` and `environmentName` (they may have access to production but not staging, or vice versa).

#### Phase 2: Lexical ↔ Yjs Binding (Client)

**Install `@lexical/yjs`** (not currently a dependency).

**New shared provider: `useProjectCollaborationProvider(projectId, environmentName)`**

Opens **one** WebSocket per project+env (shared across all collaborative editors mounted in the app). Exposes a root `Y.Doc` + a partysocket-backed provider adapter. Lives in `CamoxProvider` context so all editors within the project share it.

- Opens a WebSocket to `/parties/project-room/{projectId}:{environmentName}` via `partysocket` (can be merged with the existing `useProjectRoom` socket, or they can coexist as separate subscriptions on the same room — partysocket allows multiple subscriptions per room)
- Creates a root `Y.Doc` and a `WebsocketProvider`-compatible adapter (partysocket → y-protocols/sync)
- Connects on first collaborative editor mount, stays open until the last one unmounts

**New hook: `useCollaborativeEditor(entityType, entityId, fieldName)`**

Returns `{ provider, yjsDocMap, isConnected, id }` — everything `@lexical/yjs` `CollaborationPlugin` needs.

- Reads the project provider from context
- Computes subdoc id = `{entityType}:{entityId}:{fieldName}`
- Tells the provider to subscribe to that subdoc (lazy-load on server side)
- Returns the subdoc reference + provider for `CollaborationPlugin`
- Unsubscribes from the subdoc on unmount (but the shared socket stays open as long as other editors are mounted)

**Modify `InlineLexicalEditor`**:

- Accept optional `collaboration` prop (output of `useCollaborativeEditor`)
- When collaboration is provided:
  - Replace `OnChangePlugin` + `ExternalStateSync` + debounced HTTP mutation with `CollaborationPlugin` from `@lexical/yjs`
  - Remove `initialState` / `externalState` / `onChange` props (Yjs is the live source)
  - Keep `SelectionBroadcaster`, `EscapeHandler`, `FocusBlurHandler`, `ActivateHandler`
- When collaboration is NOT provided (read-only visitor rendering, SSR):
  - Keep current behavior unchanged — read-only Lexical from markdown

**Modify `SidebarLexicalEditor`**:

- Same pattern: accept optional `collaboration` prop, swap to `CollaborationPlugin` when present

**Modify `Field` component in `createBlock.tsx`**:

- Call `useCollaborativeEditor` with the block/item identity and field name
- Pass collaboration object down to `InlineLexicalEditor`
- Remove the `handleChange` callback that calls `blocks.updateContent` for Lexical string fields — the server flushes now

#### Phase 3: Persistence & Consistency

**Server-side flush (ProjectRoom → D1)**:

- On periodic alarm and on last-disconnect: iterate over dirty subdocs, derive Lexical state via `@lexical/yjs`, convert to markdown, call the existing `updateContent` route handler directly (in-process, not over HTTP) with the new markdown, scoped to the room's `(projectId, environmentId)`
- Fire invalidation only on last-disconnect flushes (not on every 30s periodic flush — see "Invalidation integration" below)
- The markdown↔Lexical helpers must be available in the Workers runtime — confirm `lexicalStateToMarkdown` / `markdownToLexicalState` are portable (no DOM-only deps)

**Non-collaborative writes (AI, API imports)**:

- These continue to call `updateContent` directly with markdown, env-scoped as today
- After writing, they must notify the `ProjectRoom` for the target `(projectId, environmentName)` to reset any live subdoc for that field (otherwise connected clients would keep editing stale Yjs state and overwrite the AI output on next flush)
- Simplest approach: send a reset message to the `ProjectRoom` DO naming the subdoc id; if no DO exists or no subscribers, it's a no-op

**Invalidation integration**:

- **Periodic 30s flush**: do **not** fire invalidation. Its purpose is crash safety, not propagation — firing it would make every passive viewer in the project refetch every 30s while anyone is typing.
- **Last-disconnect flush**: fire invalidation for each flushed field. Passive viewers catch up once the editing session ends.
- **Non-collaborative writes**: fire invalidation as today.
- Collaborative viewers subscribed to the field's subdoc already have the live state and don't need the invalidation — they should ignore invalidations for subdocs they currently hold (avoid double-apply flicker). Since the subdoc Yjs state IS the current state, refetching the markdown would cause a brief revert and re-converge.

#### Phase 4: Presence & Cursors

**Yjs Awareness protocol** (built into `@lexical/yjs` `CollaborationPlugin`):

- Each connected user broadcasts cursor position, selection range, and user info (name, color)
- `CollaborationPlugin` renders remote cursors and selections automatically
- User info comes from the auth session (available in `onBeforeConnect`, attached to the connection)

**User identity for cursors**:

- `ProjectRoom.onConnect` attaches user name/color to the connection metadata
- Client sends awareness info on connect
- `CollaborationPlugin`'s `providerFactory` receives the current user info
- Awareness is project+environment-scoped — users on different environments of the same project don't see each other's cursors (matches the room scope)

#### Phase 5: Cleanup

- Remove `ExternalStateSync` component from both editors (collaborative path replaces it; non-collaborative read-only path doesn't need it)
- Remove debounced `onChange` → HTTP mutation path for Lexical string fields in `createBlock.tsx` Field component
- Keep `blocks.updateContent` and `repeatableItems.updateContent` as-is — they're still used by AI, API imports, and the server-side flush from `ProjectRoom`
- Update `broadcastInvalidation` helper + its callers to include `environmentName` in the room key
- Update `useProjectRoom` hook to accept `environmentName` and include it in the room key
- No `editor_states` cleanup needed (no such table)

### What Stays the Same

- `ProjectRoom` DO — still handles invalidation broadcast (now env-scoped), extended to also handle Yjs collaboration
- `useProjectRoom` hook — still handles React Query invalidation (now env-scoped)
- D1 schema — no new tables, no column changes
- Markdown as persistence format — AI summary, API exports, read-only rendering all keep working unchanged
- Non-string field mutations (links, images, embeds, settings, positions) — still HTTP
- Page metadata (metaTitle, metaDescription) — plain text, no Lexical, no Yjs
- AI summary generation — reads markdown from D1, triggered by invalidation
- Read-only / visitor rendering — reads markdown from D1, no WebSocket

### New Dependencies

- `@lexical/yjs` — **must be added** (not currently installed). Provides `CollaborationPlugin` and Yjs ↔ Lexical binding
- `y-protocols` — Yjs sync/awareness protocol encoders (needed server-side)
- `yjs` — currently transitive via `@lexical/react`; add as a direct dep for server-side `Y.Doc`

### Open Questions

- Are `lexicalStateToMarkdown` and `markdownToLexicalState` safe to run in the Workers runtime (no DOM, no Node-only APIs)? If not, the server-side seed/flush needs a Workers-compatible implementation.
- How lossy is the markdown round-trip for the node types actually used in these editors? Any Lexical node that doesn't serialize cleanly to markdown will be dropped on every flush. Audit the active `InlineLexicalEditor` / `SidebarLexicalEditor` node configs before committing to this approach.
- DO eviction timing: confirm partyserver's idle-eviction window is long enough that the `onClose` flush always lands before the runtime is torn down.
- Subdoc subscribe protocol: does `@lexical/yjs`'s `CollaborationPlugin` natively support subscribing to subdocs by id over an existing provider, or do we need a custom wrapper that translates subdoc sub/unsub into Yjs subdoc messages? Verify before Phase 2.
- Room-key migration: changing the invalidation room key from `{projectId}` to `{projectId}:{environmentName}` is backwards-incompatible during rollout — old clients will connect to the old key and miss invalidations. Needs a coordinated client+server deploy or a brief dual-broadcast window.
