import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { int, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { z } from "zod";

import { broadcastInvalidation } from "../lib/broadcast-invalidation";
import { pub } from "../orpc";
import { projects } from "./projects";

// --- Schema ---

export const layouts = sqliteTable(
  "layouts",
  {
    id: int().primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id),
    layoutId: text("layout_id").notNull(),
    description: text(),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    index("layouts_project_idx").on(table.projectId),
    index("layouts_project_layout_idx").on(table.projectId, table.layoutId),
  ],
);

// --- Procedures ---

const syncLayoutsSchema = z.object({
  projectId: z.number(),
  layouts: z.array(
    z.object({
      layoutId: z.string(),
      description: z.string(),
      blocks: z.array(
        z.object({
          type: z.string(),
          content: z.unknown(),
          settings: z.unknown().optional(),
          placement: z.enum(["before", "after"]).optional(),
        }),
      ),
    }),
  ),
});

const list = pub.input(z.object({ projectId: z.number() })).handler(async ({ context, input }) => {
  const { projectId } = input;
  return context.db.select().from(layouts).where(eq(layouts.projectId, projectId));
});

const sync = pub.input(syncLayoutsSchema).handler(async ({ context, input }) => {
  const { projectId, layouts: layoutDefs } = input;
  const project = await context.db.select().from(projects).where(eq(projects.id, projectId)).get();

  if (!project) {
    throw new ORPCError("NOT_FOUND");
  }

  const now = Date.now();
  const results = [];

  for (const def of layoutDefs) {
    const existing = await context.db
      .select()
      .from(layouts)
      .where(and(eq(layouts.projectId, projectId), eq(layouts.layoutId, def.layoutId)))
      .get();

    if (existing) {
      const updated = await context.db
        .update(layouts)
        .set({ description: def.description, updatedAt: now })
        .where(eq(layouts.id, existing.id))
        .returning()
        .get();
      results.push(updated);
    } else {
      const created = await context.db
        .insert(layouts)
        .values({
          projectId,
          layoutId: def.layoutId,
          description: def.description,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      results.push(created);
    }
    // TODO: sync layout blocks when block creation is wired up
  }

  broadcastInvalidation(context.env.ProjectRoom, projectId, {
    entity: "layout",
    action: "updated",
  });

  return results;
});

export const layoutProcedures = { list, sync };
