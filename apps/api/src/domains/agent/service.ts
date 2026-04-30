import {
  type ToolContext,
  type ToolDefinition,
  formatToolError,
  resolveTools,
  toJsonSchemaTool,
  toolProviders,
} from "@camox/ai-tools";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { getAuthorizedProject } from "../../authorization";
import type { ServiceContext } from "../_shared/service-context";

// --- Input Schemas ---

export const callToolInput = z.object({
  projectId: z.number(),
  name: z.string(),
  arguments: z.unknown(),
});

export const listToolsInput = z.object({ projectId: z.number() });

// --- Helpers ---

async function buildToolContext(ctx: ServiceContext, projectId: number): Promise<ToolContext> {
  if (!ctx.user) throw new ORPCError("UNAUTHORIZED");
  const project = await getAuthorizedProject(ctx.db, projectId, ctx.user.id);
  if (!project) throw new ORPCError("NOT_FOUND");
  return {
    db: ctx.db,
    user: ctx.user,
    env: ctx.env,
    waitUntil: ctx.waitUntil,
    environmentName: ctx.environmentName,
    projectId,
  };
}

function findTool(tools: ToolDefinition[], name: string) {
  return tools.find((t) => t.name === name) ?? null;
}

// --- Procedures ---

/**
 * Surface the resolved tool list as JSON Schema. Adapters that need to render
 * a flat list (CLI `tools list`, future MCP `tools/list`) can call this.
 */
export async function listTools(ctx: ServiceContext, rawInput: z.input<typeof listToolsInput>) {
  const { projectId } = listToolsInput.parse(rawInput);
  const toolCtx = await buildToolContext(ctx, projectId);
  const tools = await resolveTools(toolProviders, toolCtx);
  return tools.map(toJsonSchemaTool);
}

/**
 * Adapter-agnostic tool dispatch. Validates input via Zod, runs the handler,
 * and either returns the tool result or a structured error (no throw on
 * tool-side failures — the LLM/CLI consumer needs to read the error to retry).
 *
 * Auth and project membership are checked in `buildToolContext` and surface as
 * regular ORPCError so the transport's error path handles them.
 */
export async function callTool(ctx: ServiceContext, rawInput: z.input<typeof callToolInput>) {
  const { projectId, name, arguments: args } = callToolInput.parse(rawInput);
  const toolCtx = await buildToolContext(ctx, projectId);

  const tools = await resolveTools(toolProviders, toolCtx);
  const tool = findTool(tools, name);
  if (!tool) {
    return {
      ok: false as const,
      error: {
        code: "UNKNOWN_TOOL",
        message: `Unknown tool: ${name}`,
        details: { available: tools.map((t) => t.name) },
      },
    };
  }

  try {
    const parsed = tool.inputSchema.parse(args ?? {});
    const result = await tool.handler(parsed, toolCtx);
    return { ok: true as const, result };
  } catch (err) {
    return { ok: false as const, error: formatToolError(err) };
  }
}
