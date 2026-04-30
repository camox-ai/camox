import { z } from "zod";

import {
  createBlock,
  createBlockInput,
  deleteBlock,
  deleteBlockInput,
  resolveBlockPosition,
  updateBlockContent,
  updateBlockPosition,
  updateBlockPositionInput,
  updateBlockSettings,
} from "../../../../apps/api/src/domains/blocks/service";
import type { ToolDefinition, ToolProvider } from "../types";

const positionAliasSchema = z.enum(["first", "last"]).optional();

const createBlockToolInput = createBlockInput.omit({ repeatableItems: true }).extend({
  afterId: z.number().optional(),
  beforeId: z.number().optional(),
  position: positionAliasSchema,
});

const moveBlockToolInput = updateBlockPositionInput.extend({
  afterId: z.number().optional(),
  beforeId: z.number().optional(),
  position: positionAliasSchema,
});

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
      "Positioning (pass at most one): `position: 'first' | 'last'`, `afterId: <block id>`, `beforeId: <block id>`, or the lower-level `afterPosition` / `beforePosition` (fractional-index strings). Omit all to append at the end.",
    inputSchema: createBlockToolInput,
    handler: async (input) => {
      const parsed = createBlockToolInput.parse(input);
      const resolved = await resolveBlockPosition(
        ctx,
        {
          pageId: parsed.pageId,
          afterPosition: parsed.afterPosition,
          beforePosition: parsed.beforePosition,
          afterId: parsed.afterId,
          beforeId: parsed.beforeId,
          position: parsed.position,
        },
        { mode: "create" },
      );
      return createBlock(ctx, {
        pageId: parsed.pageId,
        type: parsed.type,
        content: parsed.content,
        settings: parsed.settings,
        afterPosition: resolved.afterPosition,
        beforePosition: resolved.beforePosition,
      });
    },
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
      "Move a block to a new position on its page. Positioning (pass exactly one): `position: 'first' | 'last'`, `afterId: <block id>`, `beforeId: <block id>`, or the lower-level `afterPosition` / `beforePosition` (fractional-index strings).",
    inputSchema: moveBlockToolInput,
    handler: async (input) => {
      const parsed = moveBlockToolInput.parse(input);
      const resolved = await resolveBlockPosition(
        ctx,
        {
          blockId: parsed.id,
          afterPosition: parsed.afterPosition,
          beforePosition: parsed.beforePosition,
          afterId: parsed.afterId,
          beforeId: parsed.beforeId,
          position: parsed.position,
        },
        { mode: "move" },
      );
      return updateBlockPosition(ctx, {
        id: parsed.id,
        afterPosition: resolved.afterPosition,
        beforePosition: resolved.beforePosition,
      });
    },
  },
  {
    name: "deleteBlock",
    description: "Delete a block by id.",
    inputSchema: deleteBlockInput,
    handler: (input) => deleteBlock(ctx, deleteBlockInput.parse(input)),
  },
];
