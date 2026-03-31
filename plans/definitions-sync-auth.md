## Definitions Sync: Auth & Initial Content

### Problem

`blockDefinitions.sync` and `layouts.sync` are currently **public** API endpoints because they're called from the Vite plugin (no user session available). This is a security issue — anyone with a projectId can mutate definitions.

### Decisions

#### 1. Secret-based auth (not session-based)

Use a shared `CAMOX_API_SECRET` env var, same pattern as `apps/api/src/routes/seed.ts`.

- Vite plugin sends the secret via `x-api-secret` header
- Sync endpoints verify it before proceeding
- Reuse the same `SEED_SECRET` / `CAMOX_API_SECRET` for both seed and sync

Why not session-based auth: sync is machine-to-machine (Vite plugin, MCP server, CI). No browser or user session involved.

#### 2. Keep sync in the Vite plugin (not browser)

We considered moving sync to the SDK frontend (React) to get session auth. Rejected because:

- MCP server will also need to trigger sync, without any browser open
- CI/deploy scripts may need it too
- The Vite plugin already has the right lifecycle hooks (dev server start, file watch, build)

#### 3. Add `initialContent` and `initialSettings` to block definitions

Extend the `blockDefinitions` table with two new JSON columns:

- `initialContent` — from `block.getInitialContent()` (pure data, no browser APIs)
- `initialSettings` — from `block.getInitialSettings()` (pure data, no browser APIs)

These are synced alongside the existing definition fields. Both methods are plain object getters that work in any Node.js context (Vite SSR, build scripts, MCP).

### Implementation

1. **API**: Add secret check middleware to `blockDefinitions.sync`, `blockDefinitions.upsert`, `blockDefinitions.delete`, `layouts.sync`
2. **DB**: Add `initialContent` (json, nullable) and `initialSettings` (json, nullable) columns to `blockDefinitions`
3. **API routes**: Accept and store the new fields in sync/upsert
4. **Vite plugin** (`definitionsSync.ts`): Send `x-api-secret` header, include `initialContent`/`initialSettings` in the sync payload
5. **Env**: Add `CAMOX_API_SECRET` to `.dev.vars` and production secrets

### Phase 2: Dynamic block creation from definitions

**Goal**: Remove hardcoded block assumptions from the API. With `initialContent` and `initialSettings` stored in definitions, the API can create blocks generically without knowing specific block types.

#### What changes

1. **`routes/seed.ts`**: Instead of hardcoding hero/statistics/navbar/footer blocks, query `blockDefinitions` for the project and create 3 blocks using their `initialContent`/`initialSettings` values.

2. **`routes/pages.ts`** (`DEFAULT_HERO_BLOCK`): When creating a new page, instead of assuming a "hero" block exists, query the first non-layout-only block definition and use its `initialContent`/`initialSettings`.

#### Selection logic

- **Seed**: Pick up to 3 non-layout-only definitions (order by `blockId` or insertion order)
- **Create page**: Use the first non-layout-only definition as the default block
