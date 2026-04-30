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
- Auth is BetterAuth (session cookie, bearer token, one-time token). The `mcp` plugin is an export of `better-auth/plugins` (no extra package), not yet mounted.
- CLI (`@camox/cli`) already has `init`, `login`, `logout` and stores credentials via `lib/auth.ts`. Uses `@optique/core` for parsing.
- **Phase 1 is complete** (commits `68a957b`, `a0cf5b2`, `5c9a1b9`, `3972048`). The repo uses a domain layout — `apps/api/src/domains/<domain>/{routes,schema,service}.ts` — instead of the originally-planned flat `services/`. `domains/_shared/service-context.ts` defines the shared `ServiceContext = { db, user, env, waitUntil, environmentName }`. Each domain's `service.ts` exports Zod input schemas (commented "Exported so adapters (oRPC, MCP, CLI) share the same canonical contract"); routes are thin pass-throughs.

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
// Wraps the api-side ServiceContext and adds the session-scoped projectId.
// The adapter (MCP / agent / CLI) resolves projectId at session entry and
// injects it here so individual tools don't take it as input.
type ToolContext = ServiceContext & {
  projectId: number;
};

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ZodType; // Zod, converted to JSON Schema at the adapter boundary via z.toJSONSchema()
  outputSchema?: ZodType;
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
};

type ToolProvider = (ctx: ToolContext) => ToolDefinition[] | Promise<ToolDefinition[]>;
```

The registry is `ToolProvider[]`. Every adapter resolves the registry against a `ToolContext` at session start.

**Schemas are Zod natively, JSON Schema at the boundary.** Services already export Zod input schemas (e.g. `createBlockInput`, `updatePageInput`). Tool providers reuse those Zod schemas directly. Adapters that need raw JSON Schema (MCP `tools/list`, CLI `tools list`) call `z.toJSONSchema(schema)` at emit time. This keeps the registry in lockstep with the service contract — no second source of truth — while still letting MCP clients consume vanilla JSON Schema.

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

Tool inputs reuse the Zod schemas already exported from `apps/api/src/domains/<domain>/service.ts`. `projectId` is injected by the adapter from `ToolContext` and removed from per-tool inputs where the underlying service takes it.

Static:

- `listPages()` — wraps `listPages` (projectId from ctx)
- `getPage({ id })` — wraps `getPage`; returns page + its blocks
- `createPage({ parentPageId?, pathSegment, layoutId, contentDescription? })` — wraps `createPage`. `layoutId` is mandatory (see `listLayouts` for discovery).
- `updatePage({ id, pathSegment?, parentPageId? })` — wraps `updatePage`. (Pages have no separate title field; display content lives in blocks.)
- `setPageLayout({ id, layoutId })` — wraps `setPageLayout`
- `setPageMetaTitle({ id, metaTitle })`, `setPageMetaDescription({ id, metaDescription })` — wraps `setPageMeta*`
- `deletePage({ id })`
- `deleteBlock({ id })`
- `moveBlock({ id, afterPosition? })` — fractional-indexing position string, matching the existing service signature
- `listLayouts()` — needed because layout selection is mandatory at page creation

Dynamic (provider reads project config):

- `listBlockTypes()` — output includes JSON Schemas for each block type's `content` and `settings`
- `createBlock({ pageId, type, content, settings?, afterPosition? })` — wraps `createBlock`. `content`/`settings` are `z.unknown()` at the tool boundary; the service validates against the per-type JSON Schema and returns structured errors for LLM self-correction.
- `editBlock({ id, content?, settings? })` — wraps the corresponding update service

Out of scope for v1: file upload, deeper layout authoring (creating/editing layout definitions), repeatable-item surgery (too shape-specific — revisit after v1 usage data). `listLayouts` and `setPageLayout` are in v1 because they're prerequisites for `createPage`; full layout CRUD is not.

### Implementation Plan

#### Phase 1: Extract Service Layer ✅ DONE

**Goal**: tool handlers and oRPC routes share the same underlying functions.

Shipped in commits `68a957b` (domain restructure), `a0cf5b2` (pages), `5c9a1b9` (blocks), `3972048` (remaining domains).

What ended up shipping (vs. the original sketch):

- Domain layout `apps/api/src/domains/<domain>/{routes,schema,service}.ts` instead of a flat `services/` dir. Each domain owns its routes, drizzle schema slice, and service functions side-by-side.
- Service signature is `fn(ctx, input)` with `db`, `user`, `env`, `waitUntil`, `environmentName` all on ctx (`domains/_shared/service-context.ts`). Inputs are Zod schemas exported alongside the functions and `.parse()`d on entry — service is the trust boundary.
- oRPC routes are thin pass-throughs (`domains/<domain>/routes.ts`) that just hand `context` and `input` to the service.
- Authorization helpers (`assertPageAccess`, `assertBlockAccess`, `getAuthorizedProject`) are called from inside services using `ctx.user`, so tool handlers will inherit access checks for free.

#### Phase 2: `@camox/ai-tools` Package ✅ DONE

**New package**: `packages/ai-tools/`

- `src/types.ts` — `ToolContext` (extends api `ServiceContext` with `projectId`), `ToolDefinition`, `ToolProvider`
- `src/providers/` — one file per tool or logical group (e.g. `pages.ts`, `blocks.ts`, `layouts.ts`, `block-types.ts`). Providers import the Zod input schemas + service functions from `apps/api/src/domains/<domain>/service.ts` (workspace import) and wrap them, removing `projectId` from inputs and pulling it from `ctx`.
- `src/registry.ts` — exports `toolProviders: ToolProvider[]`
- `src/resolve.ts` — `resolveTools(providers, ctx) → ToolDefinition[]`
- `src/to-json-schema.ts` — adapter helper that emits a tool definition with `inputSchema` converted via `z.toJSONSchema(def.inputSchema)` for MCP/CLI surfaces
- `src/errors.ts` — structured error formatter so failed validations come back to the LLM as readable JSON for self-correction

No adapter code lives here. No runtime dependencies on Hono, oRPC, MCP, or `@tanstack/ai`. Depends on `@camox/api-contract`, the api workspace (for service functions and ServiceContext), and `zod`. No separate JSON Schema validator needed — services already validate via Zod.

#### Phase 3: MCP Server Adapter

Shipped first because it has no client UI surface — external MCP clients (Claude Desktop, Cursor, Claude Code) render everything. Also doubles as the fastest path to dogfooding the tool registry, which de-risks Phase 4's UI design.

**Stateless, not per-session.** No Durable Objects, no `McpAgent`, no session state to persist. The project scope is re-resolved from the bearer token on every request (free via the existing BetterAuth middleware). Tool list is re-computed per `tools/list` call — one cheap D1 query against `blockDefinitions`. What we give up by going stateless: server-push `notifications/tools/list_changed` (clients re-list on next user action — acceptable for v1) and elicitation (not planned for v1).

**Transport: official MCP SDK's Hono middleware.** Use `@modelcontextprotocol/hono`'s `WebStandardStreamableHTTPServerTransport` — purpose-built for Fetch API `Request`/`Response`, no Node-compat shim, portable off Workers later. Stay inside the official SDK family, no Cloudflare-specific wrapper. (Verified available on npm — no fallback needed.)

**Server** — new file `apps/api/src/routes/mcp.ts`:

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/hono";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

app.all("/mcp", async (c) => {
  // Fresh server + transport per request — SDK forbids reusing a connected Server
  const server = new Server({ name: "camox", version: "0.1.0" }, { capabilities: { tools: {} } });

  // projectId comes from the OAuth scope chosen at consent time
  const ctx = buildToolContext(c, projectId);
  const tools = await resolveTools(toolProviders, ctx);

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: z.toJSONSchema(t.inputSchema),
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
    const result = await tool.handler(req.params.arguments, ctx);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});
```

**Key design choices**:

- **Lower-level `Server`, not `McpServer`.** The registry holds Zod schemas; we convert to JSON Schema with `z.toJSONSchema()` at emit time, which `Server.setRequestHandler(ListTools…)` accepts directly. Going through `McpServer.registerTool`'s Standard Schema path would require it to round-trip the Zod schema itself, which is unnecessary indirection given we're already at the boundary.
- **Auth via BetterAuth's `mcp` plugin** — `import { mcp } from "better-auth/plugins"` (already shipped in the installed `better-auth` versions; no separate package). Mount it on the existing `auth` instance. OAuth 2.1 flow; access tokens resolve to the normal BetterAuth session. The existing studio-authorize consent page (commit `48176ee`, route `apps/web/src/routes/_app._auth/_authorize.studio-authorize.tsx`) is the MCP consent UI — verify it's compatible or generalize it. Project selection happens here.
- **CORS**: already configured globally on the Hono app. Ensure `Mcp-Session-Id` and `Last-Event-ID` are in `allowHeaders` (currently they're not — `index.ts` lists `Content-Type, Authorization, Better-Auth-Cookie, x-environment-name`).

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

#### Phase 5: CLI Dispatch ✅ DONE (skill deferred)

Ships **before Phase 3 (MCP)** — coding agents are the only near-term consumer, the CLI already has auth (`packages/cli/lib/auth.ts` stores a bearer token), and going CLI-first lets us dogfood the `@camox/ai-tools` registry against a trivial adapter before paying the MCP transport / OAuth tax.

What ended up shipping (vs. the original sketch):

- `agent.callTool` lives in `apps/api/src/domains/agent/{service,routes}.ts`. It builds a `ToolContext` from the authed `ServiceContext`, resolves the registry, runs `tool.inputSchema.parse(args)` and `tool.handler(...)`, and returns either `{ ok: true, result }` or `{ ok: false, error: ToolError }` so validation failures travel back as structured data the LLM can self-correct from. A companion `agent.listTools` returns `toJsonSchemaTool(...)`-formatted tools for any future surface that wants the raw catalog.
- CLI verb subcommands are **hand-rolled** in `packages/cli/src/commands/{pages,blocks,layouts}.ts` rather than codegen'd from the registry. The registry pulls in `apps/api` (drizzle, BetterAuth, Workers types) which doesn't bundle into a Node CLI, and a build-time snapshot adds tooling for thin payoff at this scale; revisit if v1 grows unwieldy. Registry tool names stay canonical (`createPage`, `setPageLayout`, …); CLI verbs map to kebab-case (`pages create`, `pages set-layout`).
- Project resolution lives in `packages/cli/src/lib/project.ts` — `--project <slug>` > `CAMOX_PROJECT` env > nearest `package.json#name` walking up from cwd (which `camox init` overwrites with the project slug). The CLI looks the slug up via `projects.getBySlug` to translate to the numeric `projectId` that `agent.callTool` expects.
- Output formatting + the structured error contract live in `packages/cli/src/lib/output.ts`; `dispatch.ts` is the shared "auth → resolve project → call tool → render" pipeline that all verb subcommands route through. Exit codes: `0` ok, `1` tool-side error, `2` auth/project resolution failure.
- Optique's variadic `or` overload doesn't infer cleanly past 6 top-level parsers, so `runSync(program)` returns `unknown`; `src/index.ts` recovers the discriminated union with a hand-written `Result` type and casts at the boundary. Each handler still type-checks its own `Args` union internally.
- Skill (`.claude/skills/camox.md`) is intentionally deferred — the verb surface is already discoverable via `camox --help` / `camox <group> --help`.

**Surface shape: verb subcommands generated from the registry (Option B).** Each tool is exposed as a real `optique` subcommand with typed flags, not a generic `tools call <name>`. This makes `camox --help` discoverable, gives humans real flags, and lets the skill teach the agent to run e.g. `camox pages create --path-segment about --layout-id 3` directly.

```
camox pages list
camox pages get --id 12
camox pages create --path-segment about --layout-id 3 [--parent-page-id N] [--content-description "..."]
camox pages update --id 12 [--path-segment ...] [--parent-page-id ...]
camox pages set-layout --id 12 --layout-id 3
camox pages set-meta-title --id 12 --meta-title "..."
camox pages set-meta-description --id 12 --meta-description "..."
camox pages delete --id 12

camox blocks types                                  # = listBlockTypes
camox blocks create --page-id 12 --type hero --content '<json>' [--settings '<json>'] [--after-position ...]
camox blocks edit --id 87 [--content '<json>'] [--settings '<json>']
camox blocks move --id 87 [--after-position ...]
camox blocks delete --id 87

camox layouts list
```

**Generation strategy** — subcommands are derived from the registry's Zod input schemas at CLI build time (a codegen step that runs against a snapshot of `resolveTools(toolProviders, fakeCtx)` for static tools, and a hand-written shim for dynamic ones whose flags don't map to fixed fields). Nested object inputs (block `content` / `settings`) take JSON via `--content '<json>'`; scalar fields become real flags. Naming: `camelCase` registry names map to `kebab-case` command paths (`createPage` → `pages create`, `setPageLayout` → `pages set-layout`); the underlying registry name stays canonical so MCP and CLI invoke the same handler.

**Project resolution** — auto-resolved from `cwd` (read `camox.config.ts` / `.env` from the scaffolded project), overridable with `--project <slug>` or `CAMOX_PROJECT` env var. Coding agents are already `cd`'d into the project, so zero-config is the right default.

**Output contract** — pretty-printed for TTY, JSON when stdout isn't a TTY or `--json` is passed. Errors go to stderr as JSON `{ code, message, details }` so the validation-error self-correction loop works for the dynamic block tools.

**API** — new procedure `agent.callTool` in `routes/agent.ts`:

- Same dispatch logic the MCP adapter will use (resolve registry + validate input via Zod + invoke handler)
- Separate from `agent.chat` — CLI path bypasses the LLM entirely; the coding agent is the LLM
- Returns the tool's structured result, or a structured validation error the agent can read

**Skill** — the coding-agent skill (`.claude/skills/camox.md` template, shipped via `camox init` or a follow-up command) tells the agent to run `camox --help` and `camox <group> --help` for discovery, then call the verb commands directly.

#### Phase 6 (deferred): Slack bot

Sketched only. Reuses the Phase 4 agent loop with a different message transport. Not implemented in v1.

### What Stays the Same

- oRPC routes + typed client — SDK UI still uses RPC for all non-agentic reads/writes (forms, drag-and-drop, etc.)
- `AiJobScheduler` Durable Object and the executor functions for summaries/SEO/metadata — background generation is unchanged
- `ProjectRoom` Durable Object and React Query invalidation — tool mutations land in D1 via service functions, then trigger the existing invalidation broadcast
- Auth providers — BetterAuth keeps handling session/bearer/MCP
- CLI `init`/`login`/`logout` — unchanged; `tools list`/`tools call` sit alongside them

### New Dependencies

- `@modelcontextprotocol/sdk` — core `Server` class and request-schema zod defs
- `@modelcontextprotocol/hono` — `WebStandardStreamableHTTPServerTransport` for the Phase 3 transport (verified available on npm)
- No new auth package — the `mcp` plugin is `import { mcp } from "better-auth/plugins"` from the already-installed `better-auth`
- No JSON Schema validator — services validate via Zod; adapters emit JSON Schema with `z.toJSONSchema()` for outbound tool listings only
- Nothing new for the TanStack agent loop — `@tanstack/ai` and `@tanstack/ai-openrouter` already installed

### Open Questions

- **Prompt caching**: TanStack AI's OpenRouter adapter — does it surface the underlying provider's prompt cache headers? Tool blobs can be multi-kB; we want them cached across turns. Verify before Phase 4 ships.
- **Tool scoping in MCP**: one session = one project, or can a session span multiple projects the user has access to? Leaning toward one-project-per-session (simpler auth, smaller tool lists), with project selection at OAuth consent time.
- **Rate limiting / cost caps**: LLM-driven writes can fan out. Add per-project monthly token budgets before public launch — not blocking for internal dogfooding.
- **Undo**: agent edits should be reversible. The existing edit history (if any — check) might already cover this; if not, batch agent-originated mutations into a single audit entry so they can be rolled back as a unit.
