import { resolveTools, rewriteAssetSchema, toolProviders } from "@camox/ai-tools";
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
import type { JSONSchema, SchemaInput } from "@tanstack/ai";
import { Hono } from "hono";
import type { Context } from "hono";
import { outdent } from "outdent";
import { z } from "zod";

import { AGENT_CHAT_MODEL_OPTIONS, createAgentChatAdapter } from "../../lib/ai";
import type { AppEnv } from "../../types";
import type { ServiceContext } from "../_shared/service-context";
import { listBlockDefinitions } from "../block-definitions/service";
import { getPage } from "../pages/service";
import { buildToolContext, executeTool } from "./service";

const agentChatContextInput = z.object({
  projectId: z.number(),
  currentPath: z.string(),
  source: z.enum(["draft", "live"]),
});

const agentChatRequestInput = z.object({
  messages: z.array(z.unknown()),
  projectId: z.number().optional(),
  currentPath: z.string().optional(),
  source: z.enum(["draft", "live"]).optional(),
  forwardedProps: z.record(z.string(), z.unknown()).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

function parseAgentChatRequest(raw: unknown): AgentChatRequest {
  const parsed = agentChatRequestInput.parse(raw);
  const context = agentChatContextInput.parse({
    ...parsed.data,
    ...parsed.forwardedProps,
    projectId: parsed.projectId ?? parsed.forwardedProps?.projectId ?? parsed.data?.projectId,
    currentPath:
      parsed.currentPath ?? parsed.forwardedProps?.currentPath ?? parsed.data?.currentPath,
    source: parsed.source ?? parsed.forwardedProps?.source ?? parsed.data?.source,
  });
  return { ...context, messages: parsed.messages as AgentChatRequest["messages"] };
}

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

function normalizeAgentChatToolArgs(
  toolName: string,
  args: unknown,
  source: AgentChatRequest["source"],
) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  if (toolName === "createPage") {
    const { contentDescription: _contentDescription, ...rest } = args as Record<string, unknown>;
    return rest;
  }
  if (!["getPage", "getBlock", "getBlocks"].includes(toolName)) return args;
  if ("source" in args) return args;
  return { ...args, source };
}

function isAllowedAgentChatTool(
  tool: Awaited<ReturnType<typeof resolveTools>>[number],
  source: AgentChatRequest["source"],
) {
  if (!tool.meta.surfaces.includes("agentChat")) return false;
  if (source === "live") return tool.meta.kind === "read";
  return true;
}

function requiresClientApproval(
  tool: Awaited<ReturnType<typeof resolveTools>>[number],
  source: AgentChatRequest["source"],
) {
  return source === "draft" && tool.meta.risk === "requiresApproval";
}

type BlockDefinitionForAgent = {
  blockId: string;
  contentSchema: JSONSchema;
  settingsSchema?: JSONSchema;
};

function isJsonSchema(value: unknown): value is JSONSchema {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toJsonSchema(value: unknown): JSONSchema {
  const rewritten = rewriteAssetSchema(value);
  return isJsonSchema(rewritten) ? rewritten : {};
}

function stripSchemaRequired(schema: JSONSchema, options: { allowItemId: boolean }): JSONSchema {
  const next: JSONSchema = { ...schema };
  delete next.required;

  if (next.properties) {
    next.properties = Object.fromEntries(
      Object.entries(next.properties).map(([key, value]) => [
        key,
        stripSchemaRequired(value, options),
      ]),
    );
    if (options.allowItemId && next.type === "object") {
      next.properties._itemId = {
        type: "number",
        description:
          "Existing repeatable item id from getBlock. Preserve this when editing repeatable items.",
      };
    }
  }

  if (next.items && !Array.isArray(next.items)) {
    next.items = stripSchemaRequired(next.items, options);
  }

  for (const key of ["allOf", "anyOf", "oneOf"] as const) {
    if (next[key]) next[key] = next[key]?.map((item) => stripSchemaRequired(item, options));
  }

  if (next.if) next.if = stripSchemaRequired(next.if, options);
  const thenSchema = Reflect.get(next, "then") as JSONSchema | undefined;
  if (thenSchema) Reflect.set(next, "then", stripSchemaRequired(thenSchema, options));
  if (next.else) next.else = stripSchemaRequired(next.else, options);

  return next;
}

const nullableStringSchema: JSONSchema = { type: ["string", "null"] };
const positioningProperties = {
  afterPosition: nullableStringSchema,
  beforePosition: nullableStringSchema,
  afterId: { type: "number" },
  beforeId: { type: "number" },
  position: { enum: ["first", "last"] },
} satisfies Record<string, JSONSchema>;

function createPageAgentChatInputSchema(): SchemaInput {
  return z.object({
    nickname: z.string().optional(),
    pathSegment: z.string(),
    parentPageId: z.number().optional(),
    layoutId: z.number(),
  });
}

function createBlockAgentChatInputSchema(defs: BlockDefinitionForAgent[]): SchemaInput | null {
  if (defs.length === 0) return null;
  return {
    oneOf: defs.map((def) => ({
      type: "object",
      properties: {
        pageId: { type: "number" },
        type: { const: def.blockId },
        content: def.contentSchema,
        ...(def.settingsSchema ? { settings: def.settingsSchema } : {}),
        ...positioningProperties,
      },
      required: ["pageId", "type", "content"],
      additionalProperties: false,
    })),
  } satisfies JSONSchema;
}

function editBlockAgentChatInputSchema(defs: BlockDefinitionForAgent[]): SchemaInput | null {
  const contentSchemas = defs.map((def) =>
    stripSchemaRequired(def.contentSchema, { allowItemId: true }),
  );
  const settingsSchemas = defs
    .map((def) => def.settingsSchema)
    .filter((schema): schema is JSONSchema => !!schema)
    .map((schema) => stripSchemaRequired(schema, { allowItemId: false }));
  if (contentSchemas.length === 0 && settingsSchemas.length === 0) return null;

  return {
    type: "object",
    properties: {
      id: { type: "number" },
      ...(contentSchemas.length > 0 ? { content: { anyOf: contentSchemas } } : {}),
      ...(settingsSchemas.length > 0 ? { settings: { anyOf: settingsSchemas } } : {}),
    },
    required: ["id"],
    anyOf: [
      ...(contentSchemas.length > 0 ? [{ required: ["content"] }] : []),
      ...(settingsSchemas.length > 0 ? [{ required: ["settings"] }] : []),
    ],
    additionalProperties: false,
  } satisfies JSONSchema;
}

async function getBlockDefinitionsForAgent(ctx: ServiceContext, projectId: number) {
  const defs = await listBlockDefinitions(ctx, { projectId });
  return defs
    .filter((def) => def.layoutOnly !== true)
    .map(
      (def): BlockDefinitionForAgent => ({
        blockId: def.blockId,
        contentSchema: toJsonSchema(def.contentSchema),
        ...(def.settingsSchema ? { settingsSchema: toJsonSchema(def.settingsSchema) } : {}),
      }),
    );
}

function getAgentChatInputSchema(
  tool: Awaited<ReturnType<typeof resolveTools>>[number],
  blockDefs: BlockDefinitionForAgent[],
): SchemaInput {
  if (tool.name === "createPage") return createPageAgentChatInputSchema();
  if (tool.name === "createBlock")
    return createBlockAgentChatInputSchema(blockDefs) ?? tool.inputSchema;
  if (tool.name === "editBlock")
    return editBlockAgentChatInputSchema(blockDefs) ?? tool.inputSchema;
  return tool.inputSchema;
}

function getAgentChatToolDescription(tool: Awaited<ReturnType<typeof resolveTools>>[number]) {
  if (tool.name !== "createPage") return tool.description;
  return (
    "Create a new page shell. `layoutId` is required — call listLayouts to discover available layouts. " +
    "`nickname` is the short internal Studio name for the page. After creating the page, create blocks explicitly with createBlock. Do not pass contentDescription."
  );
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
    - When creating a page, create the page shell first, then create blocks explicitly. Do not use or ask for contentDescription.
    - If a tool call fails validation, retry with corrected arguments when the fix is clear; otherwise ask a concise clarifying question.
    - Risky actions such as publishing, deleting, unpublishing, or discarding changes require explicit approval through the tool approval UI.
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
  const input = parseAgentChatRequest(raw);
  const ctx = serviceContextFromHono(c);
  const toolCtx = await buildToolContext(ctx, input.projectId);
  const resolvedTools = await resolveTools(toolProviders, toolCtx);
  const allowedTools = resolvedTools.filter((tool) => isAllowedAgentChatTool(tool, input.source));
  const blockDefs = await getBlockDefinitionsForAgent(ctx, input.projectId);
  const toolMetaByName = new Map(allowedTools.map((tool) => [tool.name, tool.meta]));
  const tools = allowedTools.map((tool) => {
    const definition = toolDefinition({
      name: tool.name,
      description: getAgentChatToolDescription(tool),
      inputSchema: getAgentChatInputSchema(tool, blockDefs),
      metadata: tool.meta,
    });

    if (requiresClientApproval(tool, input.source)) return definition;

    return definition.server(async (args) => {
      const response = await executeTool({
        toolCtx,
        tools: allowedTools,
        name: tool.name,
        args: normalizeAgentChatToolArgs(tool.name, args, input.source),
      });
      if (response.ok) return response.result;
      throw new Error(JSON.stringify(response.error));
    });
  });

  const pageContext = await resolvePageContext(ctx, input);
  const stream = chat({
    adapter: createAgentChatAdapter(c.env.OPEN_ROUTER_API_KEY),
    messages: convertMessagesToModelMessages(input.messages) as never,
    systemPrompts: [buildSystemPrompt(input, pageContext)],
    modelOptions: AGENT_CHAT_MODEL_OPTIONS,
    tools,
    middleware: [
      {
        name: "agent-chat-tool-metadata",
        onChunk: (_ctx, chunk) => {
          if (chunk.type !== "TOOL_CALL_START") return;
          const toolName = chunk.toolCallName ?? chunk.toolName;
          const meta = toolMetaByName.get(toolName);
          if (!meta) return;
          return { ...chunk, metadata: { ...chunk.metadata, ...meta } };
        },
      },
    ],
    agentLoopStrategy: combineStrategies([maxIterations(6), untilFinishReason(["stop"])]),
  });

  return toServerSentEventsResponse(stream);
});
