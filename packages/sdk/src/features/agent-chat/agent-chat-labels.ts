import type { UIMessage } from "@tanstack/ai-react";

const TOOL_LABELS: Record<string, string> = {
  listPages: "List pages",
  getPage: "Inspect page",
  getBlock: "Inspect block",
  getBlocks: "Inspect blocks",
  listBlockTypes: "List block types",
  describeBlockTypes: "Describe block types",
  listLayouts: "List layouts",
  createBlock: "Create block",
  editBlock: "Edit block",
  moveBlock: "Move block",
  deleteBlock: "Delete block",
  createPage: "Create page",
  updatePage: "Update page",
  setPageLayout: "Set page layout",
  setPageMetaTitle: "Set meta title",
  setPageMetaDescription: "Set meta description",
  deletePage: "Delete page",
  publishPage: "Publish page",
  unpublishPage: "Unpublish page",
  discardPageChanges: "Discard page changes",
};

type AgentChatMessagePart = UIMessage["parts"][number];
type ToolCallPart = Extract<AgentChatMessagePart, { type: "tool-call" }>;

type AgentChatToolLabelContext = {
  currentPath: string;
  source: "draft" | "live";
  toolCallContextById: ReadonlyMap<string, ToolCallRunContext>;
  pagesById: ReadonlyMap<number, PageLabelTarget>;
  blockLabelsById: ReadonlyMap<number, string>;
  blockTypeTitlesByType: ReadonlyMap<string, string>;
};

type ToolCallRunContext = {
  currentPath: string;
  source: "draft" | "live";
};

type PageLabelTarget = {
  id?: number;
  fullPath: string;
};

type ToolLabelTargetMaps = {
  pagesById: Map<number, PageLabelTarget>;
  blockLabelsById: Map<number, string>;
  blockTypeTitlesByType: Map<string, string>;
};

export function getToolLabel(name: string) {
  return TOOL_LABELS[name] ?? name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getToolCallInput(part: ToolCallPart): Record<string, unknown> {
  const input = (part as { input?: unknown }).input;
  if (isRecord(input)) return input;

  const args = (part as { arguments?: unknown }).arguments;
  if (isRecord(args)) return args;
  if (typeof args !== "string") return {};

  try {
    const parsed = JSON.parse(args) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getToolOutput(part: AgentChatMessagePart): unknown {
  if (part.type === "tool-call") return (part as { output?: unknown }).output;
  if (part.type !== "tool-result") return undefined;
  return (
    (part as { output?: unknown; result?: unknown }).output ?? (part as { result?: unknown }).result
  );
}

function rememberPage(value: unknown, maps: ToolLabelTargetMaps) {
  if (!isRecord(value)) return;
  const fullPath = getString(value.fullPath);
  if (!fullPath) return;

  const id = getNumber(value.id) ?? undefined;
  if (id !== undefined) maps.pagesById.set(id, { id, fullPath });
}

function rememberBlock(value: unknown, maps: ToolLabelTargetMaps) {
  if (!isRecord(value)) return;
  const id = getNumber(value.id);
  if (id === null) return;

  const summary = getString(value.summary);
  const type = getString(value.type);
  const typeTitle = type ? maps.blockTypeTitlesByType.get(type) : null;
  const label = summary ?? typeTitle ?? type;
  if (label) maps.blockLabelsById.set(id, label);
}

function rememberBlockType(value: unknown, maps: ToolLabelTargetMaps) {
  if (!isRecord(value)) return;
  const type = getString(value.type) ?? getString(value.blockId);
  const title = getString(value.title);
  if (type && title) maps.blockTypeTitlesByType.set(type, title);
}

function rememberToolOutput(part: ToolCallPart, output: unknown, maps: ToolLabelTargetMaps) {
  if (part.name === "listPages" && Array.isArray(output)) {
    output.forEach((page) => rememberPage(page, maps));
    return;
  }

  if ((part.name === "listBlockTypes" || part.name === "describeBlockTypes") && isRecord(output)) {
    const blockTypes = output.blockTypes;
    if (Array.isArray(blockTypes)) blockTypes.forEach((type) => rememberBlockType(type, maps));
    return;
  }

  if (part.name === "getBlocks" && Array.isArray(output)) {
    output.forEach((item) => {
      if (isRecord(item)) rememberBlock(item.block, maps);
    });
    return;
  }

  if (!isRecord(output)) return;
  rememberPage(output.page, maps);
  rememberBlock(output.block, maps);
  rememberBlock(output, maps);

  const blocks = output.blocks;
  if (Array.isArray(blocks)) blocks.forEach((block) => rememberBlock(block, maps));
}

function getPageFromInput(
  input: Record<string, unknown>,
  context: AgentChatToolLabelContext,
): PageLabelTarget | null {
  const id = getNumber(input.id);
  if (id !== null) return context.pagesById.get(id) ?? { id, fullPath: `#${id}` };

  const path = getString(input.path);
  return path ? { fullPath: path } : null;
}

function formatPageTarget(page: PageLabelTarget | null, currentPath: string) {
  if (!page) return "page";
  if (page.fullPath === currentPath) return "current page";
  if (page.fullPath.startsWith("/")) return `${page.fullPath} page`;
  return `page ${page.fullPath}`;
}

function formatBlockTarget(id: number | null, context: AgentChatToolLabelContext) {
  if (id === null) return "block";
  const label = context.blockLabelsById.get(id);
  return label ? `${label} block` : `block #${id}`;
}

function getSourcePrefix(input: Record<string, unknown>, runContext: ToolCallRunContext) {
  return input.source === "live" || runContext.source === "live" ? "live " : "";
}

function getCreatePageTarget(input: Record<string, unknown>) {
  const pathSegment = getString(input.pathSegment);
  const nickname = getString(input.nickname);
  if (pathSegment) return `/${pathSegment} page`;
  if (nickname) return `${nickname} page`;
  return "page";
}

function getBlockTypeTarget(input: Record<string, unknown>, context: AgentChatToolLabelContext) {
  const type = getString(input.type);
  if (!type) return "block";
  return `${context.blockTypeTitlesByType.get(type) ?? type} block`;
}

export function buildAgentChatToolLabelContext(params: {
  messages: readonly UIMessage[];
  currentPath: string;
  source: "draft" | "live";
  toolCallContextById?: ReadonlyMap<string, ToolCallRunContext>;
}): AgentChatToolLabelContext {
  const maps: ToolLabelTargetMaps = {
    pagesById: new Map(),
    blockLabelsById: new Map(),
    blockTypeTitlesByType: new Map(),
  };
  const toolCallsById = new Map<string, ToolCallPart>();

  for (const message of params.messages) {
    for (const part of message.parts) {
      if (part.type === "tool-call") {
        toolCallsById.set(part.id, part);
        const output = getToolOutput(part);
        if (output !== undefined) rememberToolOutput(part, output, maps);
        continue;
      }

      if (part.type !== "tool-result") continue;
      const toolCallId = (part as { toolCallId?: unknown }).toolCallId;
      if (typeof toolCallId !== "string") continue;
      const toolCall = toolCallsById.get(toolCallId);
      if (!toolCall) continue;
      const output = getToolOutput(part);
      if (output !== undefined) rememberToolOutput(toolCall, output, maps);
    }
  }

  return {
    currentPath: params.currentPath,
    source: params.source,
    toolCallContextById: params.toolCallContextById ?? new Map(),
    pagesById: maps.pagesById,
    blockLabelsById: maps.blockLabelsById,
    blockTypeTitlesByType: maps.blockTypeTitlesByType,
  };
}

export function getToolCallLabel(part: ToolCallPart, context: AgentChatToolLabelContext) {
  const input = getToolCallInput(part);
  const runContext =
    context.toolCallContextById.get(part.id) ??
    ({ currentPath: context.currentPath, source: context.source } satisfies ToolCallRunContext);

  switch (part.name) {
    case "getPage":
      return `Inspect ${getSourcePrefix(input, runContext)}${formatPageTarget(
        getPageFromInput(input, context),
        runContext.currentPath,
      )}`;
    case "getBlock":
      return `Inspect ${getSourcePrefix(input, runContext)}${formatBlockTarget(
        getNumber(input.id),
        context,
      )}`;
    case "getBlocks": {
      const ids = Array.isArray(input.ids) ? input.ids : [];
      return `Inspect ${getSourcePrefix(input, runContext)}${ids.length || "multiple"} blocks`;
    }
    case "createBlock":
      return `Create ${getBlockTypeTarget(input, context)}`;
    case "editBlock":
      return `Edit ${formatBlockTarget(getNumber(input.id), context)}`;
    case "moveBlock":
      return `Move ${formatBlockTarget(getNumber(input.id), context)}`;
    case "deleteBlock":
      return `Delete ${formatBlockTarget(getNumber(input.id), context)}`;
    case "createPage":
      return `Create ${getCreatePageTarget(input)}`;
    case "updatePage":
      return `Update ${formatPageTarget(getPageFromInput(input, context), runContext.currentPath)}`;
    case "setPageLayout":
      return `Set layout for ${formatPageTarget(
        getPageFromInput(input, context),
        runContext.currentPath,
      )}`;
    case "setPageMetaTitle":
      return `Set meta title for ${formatPageTarget(
        getPageFromInput(input, context),
        runContext.currentPath,
      )}`;
    case "setPageMetaDescription":
      return `Set meta description for ${formatPageTarget(
        getPageFromInput(input, context),
        runContext.currentPath,
      )}`;
    case "deletePage":
      return `Delete ${formatPageTarget(getPageFromInput(input, context), runContext.currentPath)}`;
    case "publishPage":
      return `Publish ${formatPageTarget(
        getPageFromInput(input, context),
        runContext.currentPath,
      )}`;
    case "unpublishPage":
      return `Unpublish ${formatPageTarget(
        getPageFromInput(input, context),
        runContext.currentPath,
      )}`;
    case "discardPageChanges":
      return `Discard changes to ${formatPageTarget(
        getPageFromInput(input, context),
        runContext.currentPath,
      )}`;
    default:
      return getToolLabel(part.name);
  }
}
