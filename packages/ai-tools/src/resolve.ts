import type { ToolContext, ToolDefinition, ToolProvider } from "./types";

export async function resolveTools(
  providers: ToolProvider[],
  ctx: ToolContext,
): Promise<ToolDefinition[]> {
  const lists = await Promise.all(providers.map(async (p) => p(ctx)));
  return lists.flat();
}
