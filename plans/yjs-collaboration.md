## Yjs Collaboration on Lexical Editors

### Goal

Enable real-time collaborative editing on all Lexical text fields (block content fields and sidebar editors) using Yjs, backed by the existing partyserver Durable Object infrastructure.

### Current State

- **Editors**: Two Lexical editor components — `InlineLexicalEditor` (inline in blocks) and `SidebarLexicalEditor` (sidebar sheet). Both use `OnChangePlugin` with 300ms debounce to serialize `editorState.toJSON()` and fire HTTP mutations (`blocks.updateContent` / `repeatableItems.updateContent`). Last-write-wins, no conflict resolution.
- **ExternalStateSync**: When not focused, editors accept new state from React Query cache (e.g. after invalidation). When focused, external updates are ignored to avoid clobbering the user's input.
- **PartyServer**: `ProjectRoom` Durable Object handles invalidation broadcast only — receives POST with `InvalidationEvent`, calls `this.broadcast()`. No Yjs, no state, no persistence.
- **Client connection**: `useProjectRoom` hook connects via `usePartySocket` per project. One room per project, used only for cache invalidation.
- **Dependencies**: `@lexical/react` v0.41 is installed (brings `yjs` as transitive dep). `@lexical/yjs` v0.41 is installed but unused. `partyserver` v0.4.1 and `partysocket` v1.1.16 are installed.

### Architecture Decision: Separate Room per Field

**One Durable Object per editable field**, not one per page or per project.

Room naming: `{entityType}:{entityId}:{fieldName}` (e.g. `block:42:title`, `repeatableItem:17:description`).

Rationale:

- Each Lexical field is an independent Yjs document. Multiplexing multiple docs in one room adds protocol complexity (namespacing messages, routing updates) with no benefit — partyserver already handles room fan-out efficiently.
- Durable Objects are created on-demand and evicted when idle. A room with 0 connections costs nothing.
- Keeps the server implementation trivial: one room = one `Y.Doc` = one Lexical binding.

The existing `ProjectRoom` stays unchanged for invalidation. Collaborative editing uses a new `EditorRoom` DO class.

### Room Lifecycle

1. User focuses a Lexical field → `EditorRoom` WebSocket opened for that field
2. On connect, server loads Yjs state from D1 (or initializes from current field value)
3. Yjs sync protocol runs over WebSocket (`y-protocols/sync`)
4. On disconnect (last client leaves), server persists Yjs state to D1, then idles
5. Durable Object evicted after inactivity — costs nothing until next connection

### Data Flow Change

**Before (current):**

```
User types → Lexical onChange (300ms debounce) → editorState.toJSON() → HTTP POST updateContent → D1 write → broadcast invalidation → other clients refetch
```

**After (with Yjs):**

```
User types → Yjs Y.Doc update → WebSocket to EditorRoom DO → broadcast to other clients → Lexical updates via Yjs binding

Persistence: EditorRoom periodically + on last-disconnect → D1 write (Yjs encoded state + derived Lexical JSON for reads)
```

The HTTP mutation path (`blocks.updateContent` for string fields) is no longer called by editors directly. Instead, the `EditorRoom` is responsible for persisting to D1. Non-collaborative writes (AI-generated content, API imports) still go through HTTP and seed the Yjs doc.

### Implementation Plan

#### Phase 1: EditorRoom Durable Object

**New file: `apps/api/src/durable-objects/editor-room.ts`**

- Extend `Server` from partyserver (like `ProjectRoom`)
- On `onConnect`: load Yjs state from D1 (`editor_states` table), initialize `Y.Doc`, sync to connecting client via `y-protocols/sync`
- On `onMessage`: apply Yjs update, broadcast to other connections
- On `onClose` (last connection): encode `Y.Doc` state, write to D1, fire invalidation event to `ProjectRoom` so non-connected clients refetch
- Periodic persistence (every 30s while active) as crash safety

**New D1 table: `editor_states`**

```sql
CREATE TABLE editor_states (
  entity_type TEXT NOT NULL,       -- "block" | "repeatableItem"
  entity_id INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  yjs_state BLOB NOT NULL,         -- Y.encodeStateAsUpdate(doc)
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (entity_type, entity_id, field_name)
);
```

**Wrangler config**: Add `EditorRoom` binding + migration tag v3.

**Auth**: Reuse the same `onBeforeConnect` pattern from `ProjectRoom` — validate session before allowing WebSocket upgrade.

#### Phase 2: Lexical ↔ Yjs Binding (Client)

**New hook: `useCollaborativeEditor(entityType, entityId, fieldName)`**

Returns `{ provider, yjsDocMap, isConnected }` — everything `@lexical/yjs` `CollaborationPlugin` needs.

- Opens a WebSocket to `/parties/editor-room/{entityType}:{entityId}:{fieldName}` via `partysocket`
- Creates `Y.Doc` and `WebsocketProvider`-compatible adapter (partysocket → y-protocols/sync)
- Connects/disconnects on mount/unmount (field focus is handled by Lexical, not the provider — provider stays connected while component is mounted)

**Modify `InlineLexicalEditor`**:

- Accept optional `collaboration` prop (output of `useCollaborativeEditor`)
- When collaboration is provided:
  - Replace `OnChangePlugin` + `ExternalStateSync` + debounced HTTP mutation with `CollaborationPlugin` from `@lexical/yjs`
  - Remove `initialState` / `externalState` / `onChange` props (Yjs is source of truth)
  - Keep `SelectionBroadcaster`, `EscapeHandler`, `FocusBlurHandler`, `ActivateHandler`
- When collaboration is NOT provided (e.g. non-authenticated visitor rendering, SSR):
  - Keep current behavior unchanged — read-only Lexical from serialized JSON

**Modify `SidebarLexicalEditor`**:

- Same pattern: accept optional `collaboration` prop, swap to `CollaborationPlugin` when present

**Modify `Field` component in `createBlock.tsx`**:

- Call `useCollaborativeEditor` with the block/item identity and field name
- Pass collaboration object down to `InlineLexicalEditor`
- Remove the `handleChange` callback that calls `blocks.updateContent` for string fields (Yjs handles persistence now)

#### Phase 3: Persistence & Consistency

**EditorRoom → D1 write**:

- On last disconnect + periodic flush: convert Yjs doc to Lexical JSON (`$generateJSONFromYjsDoc`) and write to `blocks.content[fieldName]` or `repeatable_items.content[fieldName]`
- This keeps the D1 `content` column always up-to-date for:
  - Read-only page rendering (no Yjs needed)
  - AI summary generation (reads from D1)
  - API exports / markdown conversion
  - SSR / initial page loads

**Seeding Yjs from non-collaborative writes**:

- When AI generates content or an API import writes to a field, the HTTP handler writes to D1 as before
- Additionally, it clears the `editor_states` row for that field (or updates it)
- Next time a client connects to that field's `EditorRoom`, it initializes from the D1 `content` column (no stale Yjs state)

**Invalidation integration**:

- `EditorRoom` fires an invalidation event to `ProjectRoom` after persisting, so non-connected clients see the update via React Query refetch
- Connected collaborative clients already have the update via Yjs — they should ignore the subsequent invalidation for fields they're actively editing (avoid double-update flicker)

#### Phase 4: Presence & Cursors

**Yjs Awareness protocol** (built into `@lexical/yjs` `CollaborationPlugin`):

- Each connected user broadcasts cursor position, selection range, and user info (name, color)
- `CollaborationPlugin` renders remote cursors and selections automatically
- User info comes from the auth session (available in `onBeforeConnect`, can be attached to the connection)

**User identity for cursors**:

- `EditorRoom.onConnect` attaches user name/color to the connection metadata
- Client sends awareness info on connect
- `CollaborationPlugin`'s `providerFactory` receives the current user info

#### Phase 5: Cleanup

- Remove `ExternalStateSync` component from both editors (Yjs replaces it)
- Remove debounced `onChange` → HTTP mutation path for string fields in `createBlock.tsx` Field component
- Remove string field case from `blocks.updateContent` and `repeatableItems.updateContent` if no other callers need it (keep for non-string fields like links, images)
- Clean up `editor_states` rows when blocks/repeatable items are deleted (cascade or explicit cleanup in delete handlers)

### What Stays the Same

- `ProjectRoom` DO — still handles invalidation broadcast, unchanged
- `useProjectRoom` hook — still handles React Query invalidation, unchanged
- Non-string field mutations (links, images, embeds, settings, positions) — still HTTP
- Page metadata (metaTitle, metaDescription) — plain text, no Lexical, no Yjs
- AI summary generation — reads from D1 `content` column, triggered by invalidation
- Read-only / visitor rendering — reads Lexical JSON from D1, no WebSocket

### New Dependencies

- `@lexical/yjs` — already installed, just unused. Provides `CollaborationPlugin` and Yjs ↔ Lexical binding
- `y-protocols` — Yjs sync/awareness protocol encoders (likely needed for the server-side sync)
- `yjs` — already a transitive dep, may need as direct dep for server-side `Y.Doc`
