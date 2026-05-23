const TOOL_LABELS: Record<string, string> = {
  listPages: "List pages",
  getPage: "Inspect page",
  getBlock: "Inspect block",
  getBlocks: "Inspect blocks",
  listBlockTypes: "List block types",
  describeBlockTypes: "Describe block types",
  listLayouts: "List layouts",
};

export function getToolLabel(name: string) {
  return TOOL_LABELS[name] ?? name;
}
