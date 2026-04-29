import { z } from "zod";

import {
  createBlock,
  createBlockInput,
  deleteBlock,
  deleteBlockInput,
  updateBlockContent,
  updateBlockPosition,
  updateBlockPositionInput,
  updateBlockSettings,
} from "../../../../apps/api/src/domains/blocks/service";
import type { ToolDefinition, ToolProvider } from "../types";

const createBlockToolInput = createBlockInput.omit({ repeatableItems: true });
const moveBlockToolInput = updateBlockPositionInput.omit({ beforePosition: true });
const editBlockToolInput = z.object({
  id: z.number(),
  content: z.unknown().optional(),
  settings: z.unknown().optional(),
});

export const blocksProvider: ToolProvider = (ctx): ToolDefinition[] => [
  {
    name: "createBlock",
    description:
      "Create a block on a page. `type` must be one of the block-definition ids returned by listBlockTypes. " +
      "`content` and `settings` are validated server-side against that block type's JSON Schema; on a validation failure you'll receive a structured error to retry from. " +
      "Use `afterPosition` (a fractional-index string from a sibling block) to control placement; omit to append at the end, or pass an empty string to insert at the start.",
    inputSchema: createBlockToolInput,
    handler: (input) => createBlock(ctx, createBlockToolInput.parse(input)),
  },
  {
    name: "editBlock",
    description:
      "Update a block's `content` and/or `settings`. Provide at least one. Both are merged into the existing values, so partial patches are fine.",
    inputSchema: editBlockToolInput,
    handler: async (input) => {
      const { id, content, settings } = editBlockToolInput.parse(input);
      let result: unknown = null;
      if (content !== undefined) {
        result = await updateBlockContent(ctx, { id, content });
      }
      if (settings !== undefined) {
        result = await updateBlockSettings(ctx, { id, settings });
      }
      return result;
    },
  },
  {
    name: "moveBlock",
    description:
      "Move a block to a new position on its page. `afterPosition` is the fractional-index of the sibling to insert after; omit to move to the end.",
    inputSchema: moveBlockToolInput,
    handler: (input) => updateBlockPosition(ctx, moveBlockToolInput.parse(input)),
  },
  {
    name: "deleteBlock",
    description: "Delete a block by id.",
    inputSchema: deleteBlockInput,
    handler: (input) => deleteBlock(ctx, deleteBlockInput.parse(input)),
  },
];
