import { resolveTools, toolProviders } from "@camox/ai-tools";
import type { AgentChatRequest } from "@camox/api-contract";
import {
  chat,
  combineStrategies,
  convertMessagesToModelMessages,
  maxIterations,
  toServerSentEventsResponse,
  toolDefinition,
  untilFinishReason,
} from "@tanstack/ai";
import { Hono } from "hono";
import type { Context } from "hono";
import { outdent } from "outdent";
import { z } from "zod";

import { createAgentChatAdapter } from "../../lib/ai";
import type { AppEnv } from "../../types";
import type { ServiceContext } from "../_shared/service-context";
import { getPage } from "../pages/service";
import { buildToolContext, executeTool } from "./service";

const agentChatRequestInput = z.object({
  messages: z.array(z.unknown()),
  projectId: z.number(),
  currentPath: z.string(),
  source: z.enum(["draft", "live"]),
});

function serviceContextFromHono(c: Context<AppEnv>): ServiceContext {
  return {
    db: c.var.db,
    user: c.var.user,
    env: c.env,
    waitUntil: (promise) => c.executionCtx.waitUntil(promise),
    environmentName: c.var.environmentName,
    client: c.var.client,
    telemetryDisabled: c.var.telemetryDisabled,
  };
}

function withDefaultSource(toolName: string, args: unknown, source: AgentChatRequest["source"]) {
  if (!["getPage", "getBlock", "getBlocks"].includes(toolName)) return args;
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  if ("source" in args) return args;
  return { ...args, source };
}

function buildSystemPrompt(input: AgentChatRequest, pageContext: string) {
  const sourceInstruction =
    input.source === "live"
      ? "The user is viewing Live Source. You may inspect live content, but you must not edit. Ask the user to switch to Draft Source before any content changes."
      : "The user is viewing Draft Source. You may inspect and modify draft content with available tools.";

  return outdent`
    You are Agent Chat inside Camox Studio.
    You help users inspect and edit Camox page, layout, and content structure in the current Project Environment.

    Current context:
    - Project id: ${input.projectId}
    - Environment: server-selected from the x-environment-name request header
    - Source: ${input.source}
    - Current browser path: ${input.currentPath}
    ${pageContext}

    Instructions:
    - ${sourceInstruction}
    - Use tools to inspect current Camox content when needed; do not guess block ids or page structure.
    - Prefer precise, minimal changes.
    - Use listBlockTypes and describeBlockTypes before creating or editing blocks.
    - Do not claim to edit code files or install dependencies. For code-level changes, suggest using a coding agent with the Camox CLI/skills.
    - Keep user-facing responses brief and concrete.
  `;
}

async function resolvePageContext(ctx: ServiceContext, input: AgentChatRequest) {
  try {
    const page = await getPage(ctx, {
      projectId: input.projectId,
      path: input.currentPath,
      source: input.source,
    });
    return `- Current page id: ${page.id}\n- Current page nickname: ${page.nickname}\n- Current page full path: ${page.fullPath}`;
  } catch {
    return "- Current page: not resolved. Use listPages if the user asks about available pages.";
  }
}

export const agentChatHonoRoutes = new Hono<AppEnv>().post("/chat", async (c) => {
  if (!c.var.user) return c.text("Unauthorized", 401);

  const raw = await c.req.json();
  const input = agentChatRequestInput.parse(raw) as AgentChatRequest;
  const ctx = serviceContextFromHono(c);
  const toolCtx = await buildToolContext(ctx, input.projectId);
  const resolvedTools = await resolveTools(toolProviders, toolCtx);
  const tools = resolvedTools
    .filter((tool) => tool.meta.kind === "read")
    .filter((tool) => tool.meta.surfaces.includes("agentChat"))
    .map((tool) =>
      toolDefinition({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }).server(async (args) => {
        const response = await executeTool({
          toolCtx,
          tools: resolvedTools,
          name: tool.name,
          args: withDefaultSource(tool.name, args, input.source),
        });
        if (response.ok) return response.result;
        throw new Error(JSON.stringify(response.error));
      }),
    );

  const pageContext = await resolvePageContext(ctx, input);
  const stream = chat({
    adapter: createAgentChatAdapter(c.env.OPEN_ROUTER_API_KEY),
    messages: convertMessagesToModelMessages(input.messages) as never,
    systemPrompts: [buildSystemPrompt(input, pageContext)],
    tools,
    agentLoopStrategy: combineStrategies([maxIterations(6), untilFinishReason(["stop"])]),
  });

  return toServerSentEventsResponse(stream);
});
