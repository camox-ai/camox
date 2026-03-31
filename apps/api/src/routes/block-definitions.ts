import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { pub } from "../orpc";
import { blockDefinitions, projects } from "../schema";

// --- Procedures ---

const definitionSchema = z.object({
  projectId: z.number(),
  blockId: z.string(),
  title: z.string(),
  description: z.string(),
  contentSchema: z.unknown(),
  settingsSchema: z.unknown().optional(),
  layoutOnly: z.boolean().optional(),
});

const syncSchema = z.object({
  projectId: z.number(),
  definitions: z.array(
    z.object({
      blockId: z.string(),
      title: z.string(),
      description: z.string(),
      contentSchema: z.unknown(),
      settingsSchema: z.unknown().optional(),
      layoutOnly: z.boolean().optional(),
    }),
  ),
});

const list = pub.input(z.object({ projectId: z.number() })).handler(async ({ context, input }) => {
  const result = await context.db
    .select()
    .from(blockDefinitions)
    .where(eq(blockDefinitions.projectId, input.projectId));
  return result;
});

const sync = pub.input(syncSchema).handler(async ({ context, input }) => {
  const { projectId, definitions } = input;
  const project = await context.db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new ORPCError("NOT_FOUND");
  const now = Date.now();
  const results = [];

  for (const def of definitions) {
    const existing = await context.db
      .select()
      .from(blockDefinitions)
      .where(
        and(eq(blockDefinitions.projectId, projectId), eq(blockDefinitions.blockId, def.blockId)),
      )
      .get();

    if (existing) {
      const updated = await context.db
        .update(blockDefinitions)
        .set({
          title: def.title,
          description: def.description,
          contentSchema: def.contentSchema,
          settingsSchema: def.settingsSchema ?? null,
          layoutOnly: def.layoutOnly ?? null,
          updatedAt: now,
        })
        .where(eq(blockDefinitions.id, existing.id))
        .returning()
        .get();
      results.push(updated);
    } else {
      const created = await context.db
        .insert(blockDefinitions)
        .values({
          projectId,
          blockId: def.blockId,
          title: def.title,
          description: def.description,
          contentSchema: def.contentSchema,
          settingsSchema: def.settingsSchema ?? null,
          layoutOnly: def.layoutOnly ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      results.push(created);
    }
  }

  return results;
});

const upsert = pub.input(definitionSchema).handler(async ({ context, input }) => {
  const project = await context.db
    .select()
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .get();
  if (!project) throw new ORPCError("NOT_FOUND");
  const now = Date.now();

  const existing = await context.db
    .select()
    .from(blockDefinitions)
    .where(
      and(
        eq(blockDefinitions.projectId, input.projectId),
        eq(blockDefinitions.blockId, input.blockId),
      ),
    )
    .get();

  if (existing) {
    const result = await context.db
      .update(blockDefinitions)
      .set({
        title: input.title,
        description: input.description,
        contentSchema: input.contentSchema,
        settingsSchema: input.settingsSchema ?? null,
        layoutOnly: input.layoutOnly ?? null,
        updatedAt: now,
      })
      .where(eq(blockDefinitions.id, existing.id))
      .returning()
      .get();
    return { ...result, action: "updated" as const };
  }

  const result = await context.db
    .insert(blockDefinitions)
    .values({
      ...input,
      settingsSchema: input.settingsSchema ?? null,
      layoutOnly: input.layoutOnly ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return { ...result, action: "created" as const };
});

const deleteFn = pub
  .input(z.object({ projectId: z.number(), blockId: z.string() }))
  .handler(async ({ context, input }) => {
    const { projectId, blockId } = input;
    const result = await context.db
      .delete(blockDefinitions)
      .where(and(eq(blockDefinitions.projectId, projectId), eq(blockDefinitions.blockId, blockId)))
      .returning()
      .get();
    return { deleted: !!result, blockId };
  });

export const blockDefinitionProcedures = { list, sync, upsert, delete: deleteFn };
