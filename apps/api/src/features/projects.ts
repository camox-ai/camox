import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { int, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { z } from "zod";

import { getAuthorizedProject } from "../authorization";
import { authed, pub } from "../orpc";

// --- Schema ---

export const projects = sqliteTable(
  "projects",
  {
    id: int().primaryKey({ autoIncrement: true }),
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    domain: text().notNull(),
    organizationSlug: text("organization_slug").notNull(),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("projects_slug_idx").on(table.slug),
    index("projects_domain_idx").on(table.domain),
    index("projects_organization_idx").on(table.organizationSlug),
  ],
);

// --- Procedures ---

const createProjectSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().optional(),
  domain: z.string(),
  organizationSlug: z.string(),
});

const updateProjectSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  domain: z.string(),
});

const list = pub.handler(async ({ context }) => {
  const result = await context.db.select().from(projects);
  return result;
});

const getFirst = pub.handler(async ({ context }) => {
  const result = await context.db.select().from(projects).limit(1).get();
  if (!result) throw new ORPCError("NOT_FOUND");
  return result;
});

const getBySlug = pub.input(z.object({ slug: z.string() })).handler(async ({ context, input }) => {
  const result = await context.db
    .select()
    .from(projects)
    .where(eq(projects.slug, input.slug))
    .get();
  if (!result) throw new ORPCError("NOT_FOUND");
  return result;
});

const get = pub.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const result = await context.db.select().from(projects).where(eq(projects.id, input.id)).get();
  if (!result) throw new ORPCError("NOT_FOUND");
  return result;
});

const create = authed.input(createProjectSchema).handler(async ({ context, input }) => {
  if (input.organizationSlug !== context.orgSlug) {
    throw new ORPCError("NOT_FOUND");
  }
  const now = Date.now();
  const result = await context.db
    .insert(projects)
    .values({ ...input, createdAt: now, updatedAt: now })
    .returning()
    .get();
  return result;
});

const update = authed
  .input(updateProjectSchema.extend({ id: z.number() }))
  .handler(async ({ context, input }) => {
    const { id, ...body } = input;
    const project = await getAuthorizedProject(context.db, id, context.orgSlug);
    if (!project) throw new ORPCError("NOT_FOUND");
    const result = await context.db
      .update(projects)
      .set({ ...body, updatedAt: Date.now() })
      .where(eq(projects.id, id))
      .returning()
      .get();
    return result;
  });

const deleteFn = authed.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const project = await getAuthorizedProject(context.db, input.id, context.orgSlug);
  if (!project) throw new ORPCError("NOT_FOUND");
  const result = await context.db
    .delete(projects)
    .where(eq(projects.id, input.id))
    .returning()
    .get();
  return result;
});

export const projectProcedures = {
  list,
  getFirst,
  getBySlug,
  get,
  create,
  update,
  delete: deleteFn,
};
