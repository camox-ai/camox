import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { assertSyncSecret } from "../../authorization";
import { resolveEnvironment } from "../../lib/resolve-environment";
import { blockDefinitions } from "../../schema";
import type { ServiceContext } from "../_shared/service-context";

// --- Input Schemas ---
// Exported so adapters (oRPC, MCP, CLI) share the same canonical contract.
// Services .parse() them on entry — service is the trust boundary.

const definitionFields = {
  blockId: z.string(),
  title: z.string(),
  description: z.string(),
  contentSchema: z.unknown(),
  settingsSchema: z.unknown().optional(),
  defaultContent: z.unknown().optional(),
  defaultSettings: z.unknown().optional(),
  layoutOnly: z.boolean().optional(),
};

export const listBlockDefinitionsInput = z.object({ projectId: z.number() });

export const syncBlockDefinitionsInput = z.object({
  projectSlug: z.string(),
  syncSecret: z.string(),
  autoCreate: z.boolean(),
  definitions: z.array(z.object(definitionFields)),
});

export const upsertBlockDefinitionInput = z.object({
  projectSlug: z.string(),
  syncSecret: z.string(),
  ...definitionFields,
});

export const deleteBlockDefinitionInput = z.object({
  projectSlug: z.string(),
  syncSecret: z.string(),
  blockId: z.string(),
});

// --- Reads ---

export async function listBlockDefinitions(
  ctx: ServiceContext,
  rawInput: z.input<typeof listBlockDefinitionsInput>,
) {
  const { projectId } = listBlockDefinitionsInput.parse(rawInput);
  const environment = await resolveEnvironment(ctx.db, projectId, ctx.environmentName);
  return ctx.db
    .select()
    .from(blockDefinitions)
    .where(
      and(
        eq(blockDefinitions.projectId, projectId),
        eq(blockDefinitions.environmentId, environment.id),
      ),
    );
}

// --- Writes ---

export async function syncBlockDefinitions(
  ctx: ServiceContext,
  rawInput: z.input<typeof syncBlockDefinitionsInput>,
) {
  const input = syncBlockDefinitionsInput.parse(rawInput);
  const { projectSlug, definitions, autoCreate } = input;
  const project = await assertSyncSecret(ctx.db, projectSlug, input.syncSecret);
  const projectId = project.id;
  const environment = await resolveEnvironment(ctx.db, projectId, ctx.environmentName, {
    autoCreate,
  });
  const now = Date.now();
  const results = [];

  for (const def of definitions) {
    const existing = await ctx.db
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
      const updated = await ctx.db
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
      continue;
    }

    const created = await ctx.db
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

  return { results, environmentCreated: environment.created };
}

export async function upsertBlockDefinition(
  ctx: ServiceContext,
  rawInput: z.input<typeof upsertBlockDefinitionInput>,
) {
  const { projectSlug, syncSecret, ...body } = upsertBlockDefinitionInput.parse(rawInput);
  const project = await assertSyncSecret(ctx.db, projectSlug, syncSecret);
  const projectId = project.id;
  const environment = await resolveEnvironment(ctx.db, projectId, ctx.environmentName, {
    autoCreate: true,
  });
  const now = Date.now();

  const existing = await ctx.db
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
    const result = await ctx.db
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

  const result = await ctx.db
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
}

export async function deleteBlockDefinition(
  ctx: ServiceContext,
  rawInput: z.input<typeof deleteBlockDefinitionInput>,
) {
  const { projectSlug, syncSecret, blockId } = deleteBlockDefinitionInput.parse(rawInput);
  const project = await assertSyncSecret(ctx.db, projectSlug, syncSecret);
  const environment = await resolveEnvironment(ctx.db, project.id, ctx.environmentName);
  const result = await ctx.db
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
}
