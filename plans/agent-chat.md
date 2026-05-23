# Agent Chat

## Goal

Replace the placeholder Agent Chat sheet with a first-class Camox Studio chat surface that lets authenticated users inspect and modify Camox content through the existing agentic tools. The v1 implementation uses TanStack AI directly for chat state, streaming, structured tool calls, and per-tool approvals.

## Decisions

- Agent Chat is a Camox Studio surface, mounted from Preview but implemented as its own SDK feature under `packages/sdk/src/features/agent-chat/`.
- Use TanStack AI React directly for v1; do not add Assistant UI.
- Add a plain Hono streaming route: `POST /agent/chat`.
- Use the existing OpenRouter setup with model `google/gemini-3.1-flash-lite`.
- Reuse existing Studio authentication, project authorization, environment resolution, and `broadcastInvalidation` behavior.
- Request context includes the current browser pathname, not peeked page state.
- Chat is ephemeral for v1.
- In Draft Source, Agent Chat can run curated content tools.
- In Live Source, Agent Chat is read-only; write tools are unavailable and approval is not a bypass. The UI offers a regular “Switch to draft” button outside the agent loop.
- Risky tools use TanStack AI tool approval flow per tool call. There is no plan approval UI.
- The agent creates Pages and Blocks itself. Agent Chat must not use the legacy `createPage(contentDescription)` page-generation path.
- No client-side tools, file tools, environment tools, or navigation tools in v1.

See also: `docs/adr/0001-tanstack-ai-agent-chat.md`.

## Domain Language

`CONTEXT.md` defines **Agent Chat** as a Camox Studio surface where a user describes desired page, layout, or content changes and an agent uses Camox tools to inspect and modify the current Project Environment.

## API Design

### Route

Add a Hono route in the API app:

```txt
POST /agent/chat
```

This route returns a TanStack AI Server-Sent Events response via `toServerSentEventsResponse`.

### Request Context

Put stable Camox-specific request types in `@camox/api-contract`.

Conceptual shape:

```ts
type AgentChatSource = "draft" | "live";

type AgentChatRequestContext = {
  projectId: number;
  currentPath: string;
  source: AgentChatSource;
};
```

The request body also carries TanStack AI chat messages using TanStack’s typed message/client options rather than erasing them to `unknown` where practical.

The server must derive authorization, user, session, client, telemetry flags, and environment from existing middleware/headers. The server resolves the current Page from `projectId + currentPath + source`; it must not trust a client-provided page id as authority.

### Source Behavior

- `source: "draft"`: expose read tools, draft-safe write tools, and risky write tools with approval.
- `source: "live"`: expose read tools only, defaulting reads to Live Source. The agent should explain that edits require switching to Draft Source.
- Checkpoint sources are out of scope for v1.

## AI Provider

Extract shared OpenRouter helpers out of `apps/api/src/domains/pages/ai.ts` if Agent Chat and page AI share setup. A likely location is `apps/api/src/lib/ai.ts` or `apps/api/src/domains/_shared/ai.ts`.

Agent Chat uses:

```ts
createOpenRouterText("google/gemini-3.1-flash-lite", apiKey);
```

Use the same API key/env path and failure behavior as existing page AI/SEO generation. If the key is missing, return a clear structured chat error.

## Tool Architecture

### Mandatory Tool Metadata

Make `ToolDefinition.meta` mandatory in `@camox/ai-tools`:

```ts
type ToolSurface = "cli" | "agentChat";
type ToolRisk = "safe" | "requiresApproval";

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ZodType;
  outputSchema?: ZodType;
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
  meta: {
    kind: "read" | "write";
    risk: ToolRisk;
    surfaces: ToolSurface[];
  };
};
```

Rules:

- `surfaces` is an allow-list. A tool must explicitly opt into `agentChat`.
- Read tools must be `risk: "safe"`.
- Draft-safe writes are `kind: "write", risk: "safe"`.
- Destructive/live-impacting writes are `kind: "write", risk: "requiresApproval"`.
- Environment tools remain CLI-only for v1.
- Metadata stays internal. Do not add it to `toJsonSchemaTool` or `agent.listTools` output.

### Tool Policy

Keep CLI behavior unchanged. Agent Chat applies a separate server-side policy over the resolved registry:

Auto-approved in Draft Source:

- Read tools such as `listPages`, `getPage`, `getBlock`, `getBlocks`, `listBlockTypes`, `describeBlockTypes`, `listLayouts`.
- Draft-safe writes such as `createBlock`, `editBlock`, `moveBlock`, `createPage`, `updatePage`, `setPageLayout`, `setPageMetaTitle`, `setPageMetaDescription`.

Require approval in Draft Source:

- `deleteBlock`
- `deletePage`
- `publishPage`
- `unpublishPage`
- `discardPageChanges`

Excluded from Agent Chat v1:

- Environment replication/check tools if not purely needed for chat.
- File/asset tools.
- Client-side navigation/source-switching tools.

### Shared Execution Helper

Refactor `apps/api/src/domains/agent/service.ts` so oRPC `agent.callTool` and Agent Chat share validation, handler execution, structured errors, and telemetry. Do not call oRPC from inside the API chat route.

Keep policies separate:

- CLI/oRPC `callTool`: full registry, no chat source gating.
- Agent Chat: curated/filtering policy, approval metadata, source gating.

### Dynamic Block Schemas

Keep the global registry schemas generic, but dynamically narrow tool schemas inside the Agent Chat adapter:

- `createBlock`: once block type is known, require full `content`/`settings` matching that Block Definition’s JSON Schema.
- `editBlock`: use deep partial schemas for `content`/`settings` patches.
- Repeatable fields are special: the agent must call `getBlock` before editing repeatables and preserve `_itemId` markers.

Agent Chat-specific `createPage` schema should omit `contentDescription` so the agent creates the Page shell, then creates Blocks explicitly.

## System Prompt Requirements

The system prompt should communicate:

- You are Camox Agent Chat inside Camox Studio.
- You help edit the current Project Environment.
- Current context includes environment, source, and current path.
- If source is Live Source, inspect live content only and ask the user to switch to Draft Source before edits.
- If source is Draft Source, inspect before editing when content context is needed.
- Prefer precise, minimal edits.
- Use `listBlockTypes` / `describeBlockTypes` before creating or editing Blocks.
- Do not publish, delete, unpublish, or discard changes without tool approval.
- If asked for code-level changes, explain Agent Chat only modifies Camox content/structure and suggest using a coding agent with Camox CLI/skills.

Do not automatically call `getPage` for every request; call it when the task needs page content.

## SDK Structure

Create a new feature directory:

```txt
packages/sdk/src/features/agent-chat/
  components/
    AgentChatSheet.tsx
    AgentChatThread.tsx
    AgentToolCallCard.tsx
  agent-chat-labels.ts
```

Move the implementation out of `packages/sdk/src/features/preview/components/AgentChatSheet.tsx`; no wrapper or re-export is needed. Update `CamoxPreview.tsx` to import from the new feature directory.

### UI Behavior

- Sheet header describes Agent Chat and shows the target path clearly enough for normal use.
- Simple thread with user and assistant messages.
- Inline compact tool call cards:
  - Running state: `Running getPage…`
  - Success state: user-facing label, e.g. `Edited block #123`
  - Failure state: concise error with collapsible raw details
  - Approval state: user-facing label plus subdued raw tool name
- In Live Source, show read-only state and a regular “Switch to draft” button.
- Tool results should be summarized; raw JSON is hidden/collapsible for debugging.

## Package Dependencies

- API already owns `@tanstack/ai` and `@tanstack/ai-openrouter`.
- SDK should add `@tanstack/ai-react`.
- Add `@tanstack/ai-client` only if required for `createChatClientOptions` / typed options.
- Do not add Assistant UI dependencies for v1.

## Implementation Milestones

### 1. Tool Metadata and Shared Execution

- Add mandatory `meta` to `ToolDefinition`.
- Update all `@camox/ai-tools` providers.
- Keep `toJsonSchemaTool` output stable.
- Extract shared tool execution helper for oRPC and Agent Chat.
- Verify CLI still works.

### 2. Streaming Agent Endpoint

- Add `POST /agent/chat` Hono route.
- Add `@camox/api-contract` Agent Chat context/message types.
- Resolve current page context from `projectId + currentPath + source`.
- Use OpenRouter `google/gemini-3.1-flash-lite`.
- Return TanStack AI SSE.
- Start with read tools only: `listPages`, `getPage`, `listBlockTypes`, `describeBlockTypes`, `listLayouts`.

### 3. SDK Chat UI Vertical Slice

- Add `packages/sdk/src/features/agent-chat/`.
- Move/delete old preview placeholder component.
- Connect `AgentChatSheet` to TanStack AI React with existing Studio auth/environment headers.
- Send project id, browser pathname, and source.
- Render messages and basic tool status cards.

### 4. Draft Writes and Approvals

- Enable draft-safe write tools when `source === "draft"`.
- Add approval flow for risky tools.
- Ensure Live Source exposes no write tools and cannot approval-bypass writes.
- Rely only on existing `broadcastInvalidation` for UI refresh; do not add a chat-specific refresh protocol.

### 5. Dynamic Block Schema Strictness

- Add dynamic schema narrowing for `createBlock` and `editBlock`.
- Omit `contentDescription` from Agent Chat `createPage`.
- Add retry behavior for validation failures within iteration limits.

## Validation

Run from repo root after implementation work:

```sh
pnpm check
```
