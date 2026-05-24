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

export function getToolLabel(name: string) {
  return TOOL_LABELS[name] ?? name;
}
