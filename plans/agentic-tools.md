## Agentic Tools Architecture

### Goal

Expose Camox content-editing capabilities (create pages, create/edit blocks, etc.) as a shared set of AI tools, consumable from multiple surfaces without duplicating logic:

- **In-app chat** — TanStack AI agent embedded in `CamoxStudio` (SDK)
- **Hosted MCP server** — so external LLM clients (Claude Desktop, Cursor, Claude Code) can drive a Camox project
- **CLI commands** — thin shell dispatch for coding agents that invoke Camox via a skill
- **Future** — Slack bot, email inbox, etc.

### Current State

- `@tanstack/ai` + `@tanstack/ai-openrouter` are already in use server-side for non-agentic single-shot generations (block summaries, page SEO, file metadata) scheduled via the `AiJobScheduler` Durable Object.
- AI executor functions (`executeBlockSummary`, `executePageSeo`, `executeFileMetadata`, `executeRepeatableItemSummary`) are already split from their oRPC route wrappers — a pattern worth extending.
- oRPC router exposes fine-grained CRUD over `projects`, `pages`, `blocks`, `layouts`, `files`, `block-definitions`, `repeatable-items` — too granular and shape-specific to expose directly to an LLM.
- Block property schemas are stored as JSON Schema in the `blockDefinitions` table — projects define their own block types at runtime, so tool input shapes depend on the current project's config.
- Auth is BetterAuth (session cookie, bearer token, one-time token, MCP plugin available but not mounted).
- CLI (`@camox/cli`) already has `init`, `login`, `logout` and stores credentials via `lib/auth.ts`. Uses `@optique/core` for parsing.

### Architecture Decision: Shared Tool Package + Thin Adapters

One framework-agnostic tools package is the source of truth. Each surface is a thin adapter over it.

```
packages/ai-tools/               ← NEW: tool registry, framework-agnostic
  └─ providers call service fns in apps/api/src/services/

adapters:
  • TanStack AI tools   → agent loop exposed as oRPC streaming route   → SDK chat UI
  • MCP server          → mounted at /mcp on the api Worker            → Claude Desktop / Cursor / Claude Code
  • CLI dispatch        → camox tools list | camox tools call <…>      → coding agents via skill
```

**Tools do NOT mirror oRPC procedures 1:1.** RPC is shaped for typed clients; tools are shaped for LLM legibility. Tool handlers call the same **service functions** that oRPC routes call, extracted into `apps/api/src/services/`.

### Tool Definition Shape: Provider Pattern

All tools are **providers** — functions of context. Static tools ignore context; dynamic tools read project config.

```ts
type ToolContext = {
  db: Database;
  user: User;
  project: Project; // resolved from session/scope at adapter entry
  env: Bindings;
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JSONSchema; // always emitted as JSON Schema, not Zod
  outputSchema?: JSONSchema;
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
};

type ToolProvider = (ctx: ToolContext) => ToolDefinition[] | Promise<ToolDefinition[]>;
```

The registry is `ToolProvider[]`. Every adapter resolves the registry against a `ToolContext` at session start.

### Dynamic Schemas Without Unions

We avoid discriminated unions in tool output schemas (LLMs handle them poorly). Instead, block create/edit uses a **discovery + generic write** pattern:

```
listBlockTypes()                          → returns [{type, description, jsonSchema}] as data
createBlock({ type, pageId, props: object })   ← flat static input schema
editBlock({ id, props: object })               ← flat static input schema
```

- `listBlockTypes` returns the per-project block-definition catalog (name, prose description, full JSON Schema for props) as **tool result data**, not as tool input constraints. The LLM reads it like any other text output.
- `createBlock`/`editBlock` accept `props: object` with no schema constraint. The handler validates `props` against the real block-definition schema server-side and returns structured errors so the LLM self-corrects over 1-2 turns.
- No union ever reaches the LLM's structured output. Tool count stays O(1) regardless of how many block types a project has.

This is the only pattern that works identically in MCP (where we don't control the host's system prompt) and in our own agent loop.

### Tool Catalog (v1)

Static:

- `listPages({ parentPath? })`
- `getPage({ id })` — returns page + its blocks
- `createPage({ parentId?, title, path })`
- `renamePage({ id, title })`
- `updatePagePath({ id, path })`
- `deletePage({ id })`
- `deleteBlock({ id })`
- `moveBlock({ id, beforeId? | afterId? })`

Dynamic (provider reads project config):

- `listBlockTypes()` — output includes schemas
- `createBlock({ type, pageId, props, beforeId? | afterId? })`
- `editBlock({ id, props })`

Out of scope for v1: file upload, layout management, repeatable-item surgery (too shape-specific — revisit after v1 usage data).

### Implementation Plan

#### Phase 1: Extract Service Layer

**Goal**: tool handlers and oRPC routes share the same underlying functions.

- New dir `apps/api/src/services/` with `pages.ts`, `blocks.ts`, `block-definitions.ts`
- Move write logic out of `routes/pages.ts`, `routes/blocks.ts` into service functions with signature `fn(db, ctx, input)` (no oRPC dependencies)
- oRPC routes become thin: parse + authorize + call service + broadcast invalidation
- Service functions handle authorization themselves (accept a `user` in ctx, reuse `authorization.ts` helpers) so tool handlers don't reimplement access checks

#### Phase 2: `@camox/ai-tools` Package

**New package**: `packages/ai-tools/`

- `src/types.ts` — `ToolContext`, `ToolDefinition`, `ToolProvider`
- `src/providers/` — one file per tool or logical group (e.g. `pages.ts`, `blocks.ts`)
- `src/registry.ts` — exports `toolProviders: ToolProvider[]`
- `src/resolve.ts` — `resolveTools(providers, ctx) → ToolDefinition[]`
- `src/validate.ts` — JSON Schema validation helper (ajv) + structured error formatter for LLM self-correction

No adapter code lives here. No runtime dependencies on Hono, oRPC, MCP, or `@tanstack/ai`. Depends only on `@camox/api-contract` for shared types and a JSON Schema validator.

#### Phase 3: MCP Server Adapter

Shipped first because it has no client UI surface — external MCP clients (Claude Desktop, Cursor, Claude Code) render everything. Also doubles as the fastest path to dogfooding the tool registry, which de-risks Phase 4's UI design.

**Server** — new file `apps/api/src/routes/mcp.ts`:

- Mount an MCP server at `/mcp` using the official TypeScript MCP SDK with Streamable HTTP transport
- Auth via BetterAuth's `mcp` plugin (OAuth-style flow; the `better-auth/plugins/mcp/client` dep is already installed, add the server plugin). The existing studio-authorize consent page (commit `48176ee`) is the MCP consent UI — verify it's compatible or generalize it
- On `tools/list`: resolve providers against the authenticated user's `ToolContext` and return the full list
- On `tools/call`: dispatch through the shared registry + validator
- Emit `notifications/tools/list_changed` when block definitions change in the user's project (subscribe to a project-room channel or check on each list call)
- Per-session tool resolution is cached — avoid re-querying `blockDefinitions` on every list call inside a live session

#### Phase 4: TanStack AI Agent + SDK Chat UI

**Server** — new file `apps/api/src/routes/agent.ts`:

- oRPC streaming procedure `agent.chat({ projectId, messages })`
- Resolves tool providers against the session's `ToolContext`
- Runs the agent loop via `@tanstack/ai` `chat` with `tools` populated from the resolved registry, `stream: true`
- Streams message deltas + tool-call events back to the client
- Reuses `OPEN_ROUTER_API_KEY` and `createOpenRouterText`

**Client** — new component in `packages/sdk`:

- `CamoxStudioAgentChat` component (rendered inside the studio drawer)
- Connects to the streaming oRPC procedure
- Renders message stream, tool-call traces (collapsed by default), and input composer
- On tool results that mutate content, relies on the existing PartyServer invalidation broadcast to refresh the preview — no client-side cache surgery needed

#### Phase 5: CLI Dispatch

**CLI** — new commands in `packages/cli/src/commands/`:

- `camox tools list` — prints resolved registry as JSON (name, description, input/output schemas)
- `camox tools call <name> [--json <payload>]` — HTTP-calls a new oRPC endpoint `agent.callTool({ name, input })` authed with the stored CLI token

**API** — new procedure `agent.callTool` in `routes/agent.ts`:

- Same dispatch logic as MCP adapter (resolve + validate + invoke)
- Separate from `agent.chat` — CLI path bypasses the LLM entirely, the coding agent is the LLM

**Skill** — the coding-agent skill (outside this repo, likely shipped as a `.claude/skills/camox.md` template) prompts the agent to run `camox tools list` once per task to discover capabilities, then `camox tools call` to execute. Skill authoring is a follow-up ticket.

#### Phase 6 (deferred): Slack bot

Sketched only. Reuses the Phase 4 agent loop with a different message transport. Not implemented in v1.

### What Stays the Same

- oRPC routes + typed client — SDK UI still uses RPC for all non-agentic reads/writes (forms, drag-and-drop, etc.)
- `AiJobScheduler` Durable Object and the executor functions for summaries/SEO/metadata — background generation is unchanged
- `ProjectRoom` Durable Object and React Query invalidation — tool mutations land in D1 via service functions, then trigger the existing invalidation broadcast
- Auth providers — BetterAuth keeps handling session/bearer/MCP
- CLI `init`/`login`/`logout` — unchanged; `tools list`/`tools call` sit alongside them

### New Dependencies

- `@modelcontextprotocol/sdk` (server) — for the MCP adapter
- `better-auth/plugins/mcp` (server-side entrypoint) — already available in the installed BetterAuth version
- `ajv` + `ajv-formats` — JSON Schema validation in `@camox/ai-tools`
- Nothing new for the TanStack agent loop — `@tanstack/ai` and `@tanstack/ai-openrouter` already installed

### Open Questions

- **Prompt caching**: TanStack AI's OpenRouter adapter — does it surface the underlying provider's prompt cache headers? Tool blobs can be multi-kB; we want them cached across turns. Verify before Phase 4 ships.
- **Tool scoping in MCP**: one session = one project, or can a session span multiple projects the user has access to? Leaning toward one-project-per-session (simpler auth, smaller tool lists), with project selection at OAuth consent time.
- **Rate limiting / cost caps**: LLM-driven writes can fan out. Add per-project monthly token budgets before public launch — not blocking for internal dogfooding.
- **Undo**: agent edits should be reversible. The existing edit history (if any — check) might already cover this; if not, batch agent-originated mutations into a single audit entry so they can be rolled back as a unit.
