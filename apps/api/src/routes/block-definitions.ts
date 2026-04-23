import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { assertSyncSecret } from "../authorization";
import { resolveEnvironment } from "../lib/resolve-environment";
import { pub } from "../orpc";
import { blockDefinitions } from "../schema";

// --- Procedures ---

const definitionSchema = z.object({
  projectSlug: z.string(),
  syncSecret: z.string(),
  blockId: z.string(),
  title: z.string(),
  description: z.string(),
  contentSchema: z.unknown(),
  settingsSchema: z.unknown().optional(),
  defaultContent: z.unknown().optional(),
  defaultSettings: z.unknown().optional(),
  layoutOnly: z.boolean().optional(),
});

const syncSchema = z.object({
  projectSlug: z.string(),
  syncSecret: z.string(),
  autoCreate: z.boolean(),
  definitions: z.array(
    z.object({
      blockId: z.string(),
      title: z.string(),
      description: z.string(),
      contentSchema: z.unknown(),
      settingsSchema: z.unknown().optional(),
      defaultContent: z.unknown().optional(),
      defaultSettings: z.unknown().optional(),
      layoutOnly: z.boolean().optional(),
    }),
  ),
});

const list = pub.input(z.object({ projectId: z.number() })).handler(async ({ context, input }) => {
  const environment = await resolveEnvironment(
    context.db,
    input.projectId,
    context.environmentName,
  );
  const result = await context.db
    .select()
    .from(blockDefinitions)
    .where(
      and(
        eq(blockDefinitions.projectId, input.projectId),
        eq(blockDefinitions.environmentId, environment.id),
      ),
    );
  return result;
});

const sync = pub.input(syncSchema).handler(async ({ context, input }) => {
  const { projectSlug, definitions, autoCreate } = input;
  const project = await assertSyncSecret(context.db, projectSlug, input.syncSecret);
  const projectId = project.id;
  const environment = await resolveEnvironment(context.db, projectId, context.environmentName, {
    autoCreate,
  });
  const now = Date.now();
  const results = [];

  for (const def of definitions) {
    const existing = await context.db
      .select()
      .from(blockDefinitions)
      .where(
        and(
          eq(blockDefinitions.projectId, projectId),
          eq(blockDefinitions.environmentId, environment.id),
          eq(blockDefinitions.blockId, def.blockId),
        ),
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
          defaultContent: def.defaultContent ?? null,
          defaultSettings: def.defaultSettings ?? null,
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
          environmentId: environment.id,
          blockId: def.blockId,
          title: def.title,
          description: def.description,
          contentSchema: def.contentSchema,
          settingsSchema: def.settingsSchema ?? null,
          defaultContent: def.defaultContent ?? null,
          defaultSettings: def.defaultSettings ?? null,
          layoutOnly: def.layoutOnly ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      results.push(created);
    }
  }

  return { results, environmentCreated: environment.created };
});

const upsert = pub.input(definitionSchema).handler(async ({ context, input }) => {
  const { projectSlug, syncSecret: _, ...body } = input;
  const project = await assertSyncSecret(context.db, projectSlug, input.syncSecret);
  const projectId = project.id;
  const environment = await resolveEnvironment(context.db, projectId, context.environmentName, {
    autoCreate: true,
  });
  const now = Date.now();

  const existing = await context.db
    .select()
    .from(blockDefinitions)
    .where(
      and(
        eq(blockDefinitions.projectId, projectId),
        eq(blockDefinitions.environmentId, environment.id),
        eq(blockDefinitions.blockId, body.blockId),
      ),
    )
    .get();

  if (existing) {
    const result = await context.db
      .update(blockDefinitions)
      .set({
        title: body.title,
        description: body.description,
        contentSchema: body.contentSchema,
        settingsSchema: body.settingsSchema ?? null,
        defaultContent: body.defaultContent ?? null,
        defaultSettings: body.defaultSettings ?? null,
        layoutOnly: body.layoutOnly ?? null,
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
      ...body,
      projectId,
      environmentId: environment.id,
      settingsSchema: body.settingsSchema ?? null,
      defaultContent: body.defaultContent ?? null,
      defaultSettings: body.defaultSettings ?? null,
      layoutOnly: body.layoutOnly ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return { ...result, action: "created" as const };
});

const deleteFn = pub
  .input(z.object({ projectSlug: z.string(), syncSecret: z.string(), blockId: z.string() }))
  .handler(async ({ context, input }) => {
    const { projectSlug, blockId } = input;
    const project = await assertSyncSecret(context.db, projectSlug, input.syncSecret);
    const environment = await resolveEnvironment(context.db, project.id, context.environmentName);
    const result = await context.db
      .delete(blockDefinitions)
      .where(
        and(
          eq(blockDefinitions.projectId, project.id),
          eq(blockDefinitions.environmentId, environment.id),
          eq(blockDefinitions.blockId, blockId),
        ),
      )
      .returning()
      .get();
    return { deleted: !!result, blockId };
  });

export const blockDefinitionProcedures = { list, sync, upsert, delete: deleteFn };
