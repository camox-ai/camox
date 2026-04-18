import { queryKeys } from "@camox/api-contract/query-keys";
import { and, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";

import { assertSyncSecret } from "../authorization";
import { broadcastInvalidation } from "../lib/broadcast-invalidation";
import { resolveEnvironment } from "../lib/resolve-environment";
import { pub } from "../orpc";
import { blocks, layouts, repeatableItems } from "../schema";

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
  syncSecret: z.string(),
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

const sync = pub.input(syncLayoutsSchema).handler(async ({ context, input }) => {
  const { projectSlug, layouts: layoutDefs } = input;
  const project = await assertSyncSecret(context.db, projectSlug, input.syncSecret);
  const projectId = project.id;
  const environment = await resolveEnvironment(context.db, projectId, context.environmentName, {
    autoCreate: true,
  });
  const now = Date.now();
  const results = [];

  for (const def of layoutDefs) {
    const existingLayout = await context.db
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

    const layout = existingLayout
      ? await context.db
          .update(layouts)
          .set({ description: def.description, updatedAt: now })
          .where(eq(layouts.id, existingLayout.id))
          .returning()
          .get()
      : await context.db
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

    const createdBlockTypes: string[] = [];

    // Before/after blocks can only be declared in code — the UI can't create
    // them — so every sync must backfill any declared block slot missing from
    // the DB. Never overwrite an existing block: users may have edited its
    // content in the UI.
    const existingBlocks = await context.db
      .select({
        type: blocks.type,
        placement: blocks.placement,
        position: blocks.position,
      })
      .from(blocks)
      .where(eq(blocks.layoutId, layout.id));

    const existingByKey = new Map<string, string>();
    for (const b of existingBlocks) {
      existingByKey.set(`${b.type}:${b.placement ?? ""}`, b.position);
    }

    const slots = def.blocks.map((blockDef) => ({
      def: blockDef,
      position: existingByKey.get(`${blockDef.type}:${blockDef.placement ?? ""}`) ?? null,
    }));

    let lastPos: string | null = null;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.position !== null) {
        lastPos = slot.position;
        continue;
      }

      let nextPos: string | null = null;
      for (let j = i + 1; j < slots.length; j++) {
        if (slots[j].position !== null) {
          nextPos = slots[j].position;
          break;
        }
      }

      const newPos = generateKeyBetween(lastPos, nextPos);
      const blockDef = slot.def;
      createdBlockTypes.push(blockDef.type);

      const block = await context.db
        .insert(blocks)
        .values({
          layoutId: layout.id,
          type: blockDef.type,
          content: blockDef.content,
          settings: blockDef.settings ?? null,
          placement: blockDef.placement ?? null,
          position: newPos,
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

      slot.position = newPos;
      lastPos = newPos;
    }

    results.push({
      layout,
      wasExisting: Boolean(existingLayout),
      createdBlockTypes,
    });
  }

  broadcastInvalidation(context.env.ProjectRoom, projectId, [
    queryKeys.layouts.all,
    queryKeys.pages.getByPathAll,
  ]);

  return results;
});

export const layoutProcedures = { list, sync };
