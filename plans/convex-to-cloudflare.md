## Cloudflare Migration Plan for Camox

### Stack

**Hono + D1 + partyserver (Yjs + invalidation via Durable Objects) + TanStack Query**

All in one Cloudflare Worker. No separate PartyKit service.

### Current Architecture (Convex)

- **backend-management**: SaaS, always Camox-controlled. Handles auth, billing, AI proxying, sensitive keys. Multi-tenant.
- **backend-content**: In **dev**, each user runs their own Convex deployment. In **prod**, shared multi-tenant under Camox.
- A complex sync layer (`SYNC_SECRET`, `syncToContent.ts`, JWT validation) bridges the two backends.

### Target Architecture (Cloudflare + PartyKit)

**Merge into one backend.** The two-backend split was a Convex constraint, not a real requirement. Since both backends are yours in production, they can be one Worker + one D1.

```
PRODUCTION (Camox CF account):
  One Hono Worker (single deploy)
    ├── HTTP routes → D1 (multi-tenant, projectId scoping)
    ├── R2 for file storage
    ├── Durable Objects (partyserver) → Yjs collaboration + invalidation broadcast
    └── All secrets (AI keys, etc.) via wrangler secret

DEVELOPMENT (user's machine):
  wrangler dev → everything runs locally (Worker + D1/SQLite + R2/filesystem + Durable Objects)
  No separate process. No cloud deployment needed. No API keys needed.
  Production-only features (AI, billing, etc.) proxy to the production Worker.
```

### Key Tech Choices

| Layer                   | Technology                                                           | Replaces                                       |
| ----------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| API framework           | **Hono** (Cloudflare Worker)                                         | Convex HTTP actions + queries/mutations        |
| Database                | **Drizzle ORM** + **D1** (SQLite)                                    | Convex database (two deployments)              |
| File storage            | **R2**                                                               | Convex file storage                            |
| Auth                    | Cloudflare Auth (or Lucia/custom)                                    | Convex auth                                    |
| Real-time collaboration | **partyserver** + **Yjs** (Durable Objects, `hono-party` middleware) | Convex reactive subscriptions                  |
| Data invalidation       | **partyserver** WebSocket broadcast                                  | Convex reactive subscriptions                  |
| Frontend data fetching  | **TanStack Query** + **Hono RPC client** (`hc`)                      | Convex React hooks (`useQuery`, `useMutation`) |
| End-to-end type safety  | **Hono RPC** (`hc<AppType>`) — no codegen, no tRPC needed            | Convex typed `api` imports                     |
| Local dev               | `wrangler dev` (runs everything)                                     | Per-developer Convex cloud deployments         |

### Real-Time Architecture (partyserver + Durable Objects)

Real-time lives inside the same Hono Worker via `partyserver` (Durable Objects) and the `hono-party` middleware. No separate service or deploy.

**1. Multiplayer collaboration (Yjs)**

- Collaborative editing on Lexical fields (block content fields from `createBlock`, page inputs in `PageContentSheet`)
- `partyserver` as the Yjs WebSocket provider
- Multi-cursor presence with per-field tracking

**2. Data invalidation (AI jobs, cross-user updates)**

- When background AI jobs complete (SEO generation, block summaries, file metadata), the Worker calls `this.broadcast()` on the page's Durable Object
- Connected clients receive the event and call `queryClient.invalidateQueries()` on the affected entities
- Same mechanism works for any server-side data change that other connected clients need to see

**3. Query granularity: cache seeding for block-level invalidation**

- The full page query (`useQuery(["pages", pageId])`) fetches the page with all its blocks in one request
- Inside its `queryFn`, it seeds each block into its own cache entry via `queryClient.setQueryData(["blocks", blockId], block)`
- Block components read from `useQuery(["blocks", blockId])` — already warm from the seed, no extra request
- WebSocket invalidation targets only the changed block (`invalidateQueries(["blocks", blockId])`), which refetches a single lightweight block endpoint instead of the entire page

```
Frontend (TanStack Query + partyserver WebSocket)
  ├── useQuery("pages", pageId) → Hono Worker → D1 (full page + blocks, seeds block caches)
  ├── useQuery("blocks", blockId) → seeded from page query, refetched individually on invalidation
  ├── usePartySocket(pageId) → invalidation events → queryClient.invalidateQueries(["blocks", blockId])
  └── YjsProvider(partyserver) → collaborative Lexical fields (cursors, edits)

Worker (AI job completes)
  └── Durable Object stub → broadcast { type: "block:updated", blockId } → client refetches one block
```

**4. Auth-gated WebSocket: live updates only for CMS users**

- Regular site visitors get SSR-hydrated data via TanStack Query's `initialData` — no WebSocket connection, no unnecessary load or layout shifts
- Authenticated CMS users connect to the partyserver room (`usePartySocket({ room, enabled: isAuthenticated })`) to receive invalidation events
- This mirrors the current Convex pattern where `useQuery(api.pages.getPage, isAuthenticated ? args : "skip")` prevents live subscriptions for visitors — but cleaner because data fetching (HTTP) and live updates (WebSocket) are separate concerns, so only the expensive persistent connection is gated behind auth

**Considered and deferred:** TanStack DB (reactive client-side collections with sync engine support). Would allow granular push updates instead of invalidate-and-refetch, but adds complexity for minimal gain — payloads are small, refetch latency is negligible, and Yjs handles the heavy real-time work. Can be layered in later if needed.

**Considered and skipped:** tRPC. Hono's built-in RPC client (`hc<AppType>`) already provides end-to-end type safety — route params, request bodies, and response types are all inferred from route definitions. No codegen, no extra dependency. TanStack Query wraps the `hc` client for caching/fetching.

### PartyKit Room Design

One room per page. Presence is page-level (see who's on the page, track which field they're in). Multiple Yjs docs are multiplexed inside the room, namespaced by field (e.g. `block:${blockId}:content`, `page:${pageId}:metaTitle`). Awareness state includes the active field ID so cursors/selections render in the right place.

### What Gets Eliminated

- `SYNC_SECRET` and all sync logic
- JWT validation between backends
- Two separate schemas/deployments
- Per-developer cloud provisioning for local dev

### Migration Strategy

1. Build one Drizzle schema merging management + content tables
2. Build one Hono Worker with all routes
3. Add Durable Object (partyserver) for Yjs rooms + invalidation broadcast via `hono-party` middleware
4. Migrate frontend from Convex React hooks to TanStack Query + `usePartySocket`
5. Integrate Yjs into Lexical fields via partyserver WebSocket
6. `wrangler dev` for local dev, `pnpm db:seed` for dev data
7. Migrate data from Convex to D1 (export → transform → import)

### Production-Only Features (AI, Billing, etc.)

Some features require secrets or services that only exist in production (AI API keys, billing provider). These are never mocked — the product is designed around them.

**How it works:** Routes for production-only features have a single implementation. In production, they execute directly. In local dev, the local Worker proxies the request to the production Worker over the network.

```
Production:
  Client → Worker → AI route handler → OpenAI/Anthropic API (direct, no extra hop)

Local dev:
  Client → local Worker → detects production-only route → proxies to production Worker → AI route handler → OpenAI/Anthropic API
```

This keeps the DX simple (one codebase, one set of routes) and avoids duplicating logic. The proxy layer is transparent — frontend code calls the same routes regardless of environment.
