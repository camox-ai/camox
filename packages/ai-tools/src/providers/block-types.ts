import { z } from "zod";

import { listBlockDefinitions } from "../../../../apps/api/src/domains/block-definitions/service";
import type { ToolDefinition, ToolProvider } from "../types";

const listBlockTypesToolInput = z.object({});

export const blockTypesProvider: ToolProvider = (ctx): ToolDefinition[] => [
  {
    name: "listBlockTypes",
    description:
      "List the block types available in the current project. Each entry includes the JSON Schemas for that block's `content` and `settings` — use them when constructing arguments to createBlock and editBlock. " +
      "Block types whose `layoutOnly` is true can only appear inside layouts and are not valid for createBlock on a page.",
    inputSchema: listBlockTypesToolInput,
    handler: async () => {
      const defs = await listBlockDefinitions(ctx, { projectId: ctx.projectId });
      return defs.map((d) => ({
        type: d.blockId,
        title: d.title,
        description: d.description,
        contentSchema: d.contentSchema,
        settingsSchema: d.settingsSchema,
        layoutOnly: d.layoutOnly ?? false,
      }));
    },
  },
];
