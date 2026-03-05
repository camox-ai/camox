import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { generateKeyBetween } from "fractional-indexing";
import { splitContent } from "./lib/contentAssembly";

export const listLayouts = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("layouts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const syncLayouts = mutation({
  args: {
    projectId: v.id("projects"),
    layouts: v.array(
      v.object({
        layoutId: v.string(),
        blocks: v.array(
          v.object({
            type: v.string(),
            content: v.any(),
            settings: v.optional(v.any()),
            placement: v.optional(
              v.union(v.literal("before"), v.literal("after")),
            ),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const tmpl of args.layouts) {
      const existing = await ctx.db
        .query("layouts")
        .withIndex("by_project_layoutId", (q) =>
          q.eq("projectId", args.projectId).eq("layoutId", tmpl.layoutId),
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { updatedAt: now });
        continue;
      }

      // Create layout record
      const layoutDocId = await ctx.db.insert("layouts", {
        projectId: args.projectId,
        layoutId: tmpl.layoutId,
        createdAt: now,
        updatedAt: now,
      });

      // Create default blocks for new layout
      let prevPosition: string | null = null;
      for (const block of tmpl.blocks) {
        const position = generateKeyBetween(prevPosition, null);
        const { scalarContent, arrayFields: _arrayFields } = splitContent(
          block.content,
        );

        await ctx.db.insert("blocks", {
          layoutId: layoutDocId,
          type: block.type,
          content: scalarContent,
          settings: block.settings,
          placement: block.placement,
          summary: block.type,
          position,
          createdAt: now,
          updatedAt: now,
        });

        prevPosition = position;
      }
    }

    return { synced: args.layouts.length };
  },
});
