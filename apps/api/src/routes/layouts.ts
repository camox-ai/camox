import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";

import { broadcastInvalidation } from "../lib/broadcast-invalidation";
import { queryKeys } from "../lib/query-keys";
import { resolveEnvironment } from "../lib/resolve-environment";
import { pub, synced } from "../orpc";
import { blocks, layouts, projects, repeatableItems } from "../schema";

// --- Procedures ---

const repeatableItemSeedSchema = z.object({
  tempId: z.string(),
  parentTempId: z.string().nullable(),
  fieldName: z.string(),
  content: z.unknown(),
  position: z.string(),
});

const syncLayoutsSchema = z.object({
  projectSlug: z.string(),
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
          repeatableItems: z.array(repeatableItemSeedSchema).optional(),
        }),
      ),
    }),
  ),
});

const list = pub.input(z.object({ projectId: z.number() })).handler(async ({ context, input }) => {
  const { projectId } = input;
  const environment = await resolveEnvironment(context.db, projectId, context.environmentName);
  return context.db
    .select()
    .from(layouts)
    .where(and(eq(layouts.projectId, projectId), eq(layouts.environmentId, environment.id)));
});

const sync = synced.input(syncLayoutsSchema).handler(async ({ context, input }) => {
  const { projectSlug, layouts: layoutDefs } = input;
  const project = await context.db
    .select()
    .from(projects)
    .where(eq(projects.slug, projectSlug))
    .get();

  if (!project) {
    throw new ORPCError("NOT_FOUND");
  }

  const projectId = project.id;
  const environment = await resolveEnvironment(context.db, projectId, context.environmentName, {
    autoCreate: true,
  });
  const now = Date.now();
  const results = [];

  for (const def of layoutDefs) {
    const existing = await context.db
      .select()
      .from(layouts)
      .where(
        and(
          eq(layouts.projectId, projectId),
          eq(layouts.environmentId, environment.id),
          eq(layouts.layoutId, def.layoutId),
        ),
      )
      .get();

    if (existing) {
      const updated = await context.db
        .update(layouts)
        .set({ description: def.description, updatedAt: now })
        .where(eq(layouts.id, existing.id))
        .returning()
        .get();
      results.push(updated);
      continue;
    }

    const created = await context.db
      .insert(layouts)
      .values({
        projectId,
        environmentId: environment.id,
        layoutId: def.layoutId,
        description: def.description,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    results.push(created);

    // Create blocks for newly created layouts
    let prevPosition: string | null = null;
    for (const blockDef of def.blocks) {
      const position = generateKeyBetween(prevPosition, null);
      prevPosition = position;

      const block = await context.db
        .insert(blocks)
        .values({
          layoutId: created.id,
          type: blockDef.type,
          content: blockDef.content,
          settings: blockDef.settings ?? null,
          placement: blockDef.placement ?? null,
          position,
          summary: "",
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      const itemSeeds = blockDef.repeatableItems;
      if (itemSeeds && itemSeeds.length > 0) {
        const tempIdToRealId = new Map<string, number>();
        for (const seed of itemSeeds) {
          const parentItemId = seed.parentTempId
            ? (tempIdToRealId.get(seed.parentTempId) ?? null)
            : null;
          const inserted = await context.db
            .insert(repeatableItems)
            .values({
              blockId: block.id,
              parentItemId,
              fieldName: seed.fieldName,
              content: seed.content,
              summary: "",
              position: seed.position,
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get();
          tempIdToRealId.set(seed.tempId, inserted.id);
        }
      }
    }
  }

  broadcastInvalidation(context.env.ProjectRoom, projectId, [
    queryKeys.layouts.all,
    queryKeys.pages.getByPathAll,
  ]);

  return results;
});

export const layoutProcedures = { list, sync };
