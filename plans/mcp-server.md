# MCP Server

Implement a hosted Camox MCP Server in the existing Hono API.

## Decisions

- Use one authenticated MCP Server connection per Camox backend/account.
- Authenticate MCP requests with the existing Better Auth bearer/session middleware.
- Add `"mcp"` as a first-class `ToolSurface`.
- Keep MCP tool calls self-contained by requiring `projectId` and `environmentName` on project content tools.
- Keep `environmentName` as the project-specific Environment name string.
- Use discovery tools for account/project/environment selection:
  - `getCurrentUser`
  - `listOrganizations`
  - `listProjects`
  - `listEnvironments`
- Keep CLI-shaped ambient environment tools CLI-only.
- Expose explicit MCP environment replication tools with `sourceEnvName` and `targetEnvName`.
- Keep MCP-specific tool schemas in `@camox/ai-tools` so the registry remains the source of truth.

## Auth Tradeoff

The initial bearer/session auth path is good for local development and clients where the user can paste a token from `camox login`. It is not enough for hosted or mobile MCP clients such as ChatGPT on a phone, because those clients need a remote HTTPS MCP endpoint with an in-browser authorization flow rather than access to `~/.camox/auth.json`.

Supporting those clients likely requires adding Better Auth's OAuth/OIDC provider flow for MCP:

- Expose standards-compatible OAuth/OIDC metadata, authorization, token, refresh, and optional dynamic client registration endpoints.
- Let users sign in with their Camox account and approve MCP access from the browser.
- Accept OAuth access tokens on `/mcp`, not only existing Better Auth session bearer tokens.
- Consider scopes such as `mcp:read` and `mcp:write`, while still enforcing Camox organization, Project, and Environment authorization in tool handlers.
- Keep bearer/session auth as a local/dev fallback, not the final hosted-client product experience.

## Implementation

- Add MCP SDK dependency to the API package.
- Split ai-tools context into base and scoped contexts.
- Add `"mcp"` to `ToolSurface`.
- Add MCP discovery and explicit environment providers.
- Add a helper that wraps scoped content tools with `projectId` and `environmentName`.
- Add Hono `/mcp` route backed by `WebStandardStreamableHTTPServerTransport`.
- Return structured tool output plus JSON text for compatibility.
- Run `pnpm check` from the repo root.
