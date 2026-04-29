import { z } from "zod";

import { listLayouts } from "../../../../apps/api/src/domains/layouts/service";
import type { ToolDefinition, ToolProvider } from "../types";

const listLayoutsToolInput = z.object({});

export const layoutsProvider: ToolProvider = (ctx): ToolDefinition[] => [
  {
    name: "listLayouts",
    description:
      "List the layouts available in the current project. Layout ids are required when creating pages.",
    inputSchema: listLayoutsToolInput,
    handler: () => listLayouts(ctx, { projectId: ctx.projectId }),
  },
];
