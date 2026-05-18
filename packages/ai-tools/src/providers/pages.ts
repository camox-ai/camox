import { z } from "zod";

import { getPageMarkdown } from "../../../../apps/api/src/domains/blocks/service";
import {
  createPage,
  createPageInput,
  deletePage,
  deletePageInput,
  getPage,
  listPages,
  pageSourceSchema,
  publishPage,
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
// `source` defaults to "draft" in the agent / CLI tool — the user is editing
// the working copy unless they explicitly ask for the published version.
const getPageToolInput = z.union([
  z.object({ id: z.number(), source: pageSourceSchema.optional() }),
  z.object({ path: z.string(), source: pageSourceSchema.optional() }),
]);
// Publish accepts either `id` or `path` so the CLI can mirror `pages get`'s
// flags. `alsoPublishLayout` defaults true at the CLI layer; the underlying
// service no-ops when the layout has no pending changes.
const publishPageToolInput = z
  .object({
    id: z.number().optional(),
    path: z.string().optional(),
    alsoPublishLayout: z.boolean().optional(),
  })
  .refine((d) => (d.id != null) !== (d.path != null), {
    message: "Pass exactly one of `id` or `path`.",
  });

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
      "Fetch a single page by id or by full path (e.g. `/about`). Returns the page row and an ordered array of its blocks, each with `id`, `position`, and rendered `markdown`. Layout-scoped blocks are not included — use the layouts tools to inspect those. " +
      "Defaults to reading the draft; pass `source: 'live'` to read the published snapshot (errors if the page has never been published).",
    inputSchema: getPageToolInput,
    handler: async (input) => {
      const parsed = getPageToolInput.parse(input);
      const source = parsed.source ?? "draft";
      const page =
        "id" in parsed
          ? await getPage(ctx, { id: parsed.id, source })
          : await getPage(ctx, { projectId: ctx.projectId, path: parsed.path, source });
      const { blocks } = await getPageMarkdown(ctx, { pageId: page.id, source });
      return { page, blocks };
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
  {
    name: "publishPage",
    description:
      "Promote the page's current draft to live. Accepts either `id` or `path` (e.g. `/about`). " +
      "Pass `alsoPublishLayout: true` (default behavior in the CLI's `pages publish`) to bundle the page's layout into the same publish — a no-op when the layout has no pending changes.",
    inputSchema: publishPageToolInput,
    handler: async (input) => {
      const parsed = publishPageToolInput.parse(input);
      let id = parsed.id;
      if (id == null && parsed.path != null) {
        const page = await getPage(ctx, {
          projectId: ctx.projectId,
          path: parsed.path,
          source: "draft",
        });
        id = page.id;
      }
      if (id == null) {
        throw new Error("Pass exactly one of `id` or `path`.");
      }
      return publishPage(ctx, { id, alsoPublishLayout: parsed.alsoPublishLayout });
    },
  },
];
