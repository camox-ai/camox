import { z } from "zod";

import { getPageMarkdown } from "../../../../apps/api/src/domains/blocks/service";
import {
  createPage,
  createPageInput,
  deletePage,
  deletePageInput,
  getPage,
  getPageInput,
  listPages,
  setPageLayout,
  setPageLayoutInput,
  setPageMetaDescription,
  setPageMetaDescriptionInput,
  setPageMetaTitle,
  setPageMetaTitleInput,
  updatePage,
  updatePageInput,
} from "../../../../apps/api/src/domains/pages/service";
import type { ToolDefinition, ToolProvider } from "../types";

const listPagesToolInput = z.object({});
const createPageToolInput = createPageInput.omit({ projectId: true });

export const pagesProvider: ToolProvider = (ctx): ToolDefinition[] => [
  {
    name: "listPages",
    description: "List all pages in the current project.",
    inputSchema: listPagesToolInput,
    handler: () => listPages(ctx, { projectId: ctx.projectId }),
  },
  {
    name: "getPage",
    description:
      "Fetch a single page by id. Returns the page row and the rendered Markdown of its blocks (and any layout-scoped blocks above/below).",
    inputSchema: getPageInput,
    handler: async (input) => {
      const { id } = getPageInput.parse(input);
      const page = await getPage(ctx, { id });
      const { markdown } = await getPageMarkdown(ctx, { pageId: id });
      return { page, markdown };
    },
  },
  {
    name: "createPage",
    description:
      "Create a new page. `layoutId` is required — call listLayouts to discover available layouts. " +
      "If `contentDescription` is provided, the AI generates initial blocks from it; otherwise the page starts with a default hero block.",
    inputSchema: createPageToolInput,
    handler: (input) => {
      const data = createPageToolInput.parse(input);
      return createPage(ctx, { ...data, projectId: ctx.projectId });
    },
  },
  {
    name: "updatePage",
    description:
      "Update a page's `pathSegment` and/or `parentPageId`. Pages have no separate title field — visible content lives in blocks.",
    inputSchema: updatePageInput,
    handler: (input) => updatePage(ctx, updatePageInput.parse(input)),
  },
  {
    name: "setPageLayout",
    description: "Change a page's layout. Use listLayouts to discover layout ids.",
    inputSchema: setPageLayoutInput,
    handler: (input) => setPageLayout(ctx, setPageLayoutInput.parse(input)),
  },
  {
    name: "setPageMetaTitle",
    description: "Set a page's SEO meta title.",
    inputSchema: setPageMetaTitleInput,
    handler: (input) => setPageMetaTitle(ctx, setPageMetaTitleInput.parse(input)),
  },
  {
    name: "setPageMetaDescription",
    description: "Set a page's SEO meta description.",
    inputSchema: setPageMetaDescriptionInput,
    handler: (input) => setPageMetaDescription(ctx, setPageMetaDescriptionInput.parse(input)),
  },
  {
    name: "deletePage",
    description: "Delete a page by id. The blocks on the page are deleted as well.",
    inputSchema: deletePageInput,
    handler: (input) => deletePage(ctx, deletePageInput.parse(input)),
  },
];
