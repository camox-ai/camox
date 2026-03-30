import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { int, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { z } from "zod";

import { getAuthorizedProject } from "../authorization";
import { authed, pub } from "../orpc";
import { projects } from "./projects";

// --- Schema ---

export const blockDefinitions = sqliteTable(
  "block_definitions",
  {
    id: int().primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id),
    blockId: text("block_id").notNull(),
    title: text().notNull(),
    description: text().notNull(),
    contentSchema: text("content_schema", { mode: "json" }).notNull(),
    settingsSchema: text("settings_schema", { mode: "json" }),
    layoutOnly: int("layout_only", { mode: "boolean" }),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    index("block_definitions_project_idx").on(table.projectId),
    index("block_definitions_project_block_idx").on(table.projectId, table.blockId),
  ],
);

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

const sync = authed.input(syncSchema).handler(async ({ context, input }) => {
  const { projectId, definitions } = input;
  const project = await getAuthorizedProject(context.db, projectId, context.orgSlug);
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

const upsert = authed.input(definitionSchema).handler(async ({ context, input }) => {
  const project = await getAuthorizedProject(context.db, input.projectId, context.orgSlug);
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
    return result;
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
  return result;
});

const deleteFn = authed
  .input(z.object({ projectId: z.number(), blockId: z.string() }))
  .handler(async ({ context, input }) => {
    const { projectId, blockId } = input;
    const project = await getAuthorizedProject(context.db, projectId, context.orgSlug);
    if (!project) throw new ORPCError("NOT_FOUND");
    const result = await context.db
      .delete(blockDefinitions)
      .where(and(eq(blockDefinitions.projectId, projectId), eq(blockDefinitions.blockId, blockId)))
      .returning()
      .get();
    if (!result) throw new ORPCError("NOT_FOUND");
    return result;
  });

export const blockDefinitionProcedures = { list, sync, upsert, delete: deleteFn };
