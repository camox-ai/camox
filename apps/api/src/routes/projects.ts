import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getAuthorizedProject } from "../authorization";
import { generateUniqueSlug } from "../lib/slug";
import { authed } from "../orpc";
import { projects } from "../schema";

// --- Procedures ---

const createProjectSchema = z.object({
  name: z.string(),
  organizationSlug: z.string(),
});

const updateProjectSchema = z.object({
  name: z.string(),
});

const list = authed.handler(async ({ context }) => {
  const result = await context.db
    .select()
    .from(projects)
    .where(eq(projects.organizationSlug, context.orgSlug));
  return result;
});

const getFirst = authed.handler(async ({ context }) => {
  const result = await context.db
    .select()
    .from(projects)
    .where(eq(projects.organizationSlug, context.orgSlug))
    .limit(1)
    .get();
  if (!result) throw new ORPCError("NOT_FOUND");
  return result;
});

const getBySlug = authed
  .input(z.object({ slug: z.string() }))
  .handler(async ({ context, input }) => {
    const result = await context.db
      .select()
      .from(projects)
      .where(eq(projects.slug, input.slug))
      .get();
    if (!result || result.organizationSlug !== context.orgSlug) {
      throw new ORPCError("NOT_FOUND");
    }
    return result;
  });

const get = authed.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const result = await context.db.select().from(projects).where(eq(projects.id, input.id)).get();
  if (!result || result.organizationSlug !== context.orgSlug) {
    throw new ORPCError("NOT_FOUND");
  }
  return result;
});

const create = authed.input(createProjectSchema).handler(async ({ context, input }) => {
  if (input.organizationSlug !== context.orgSlug) {
    throw new ORPCError("NOT_FOUND");
  }

  const slug = await generateUniqueSlug(context.db);
  const syncSecret = crypto.randomUUID();
  const now = Date.now();

  const result = await context.db
    .insert(projects)
    .values({
      name: input.name,
      slug,
      syncSecret,
      organizationSlug: input.organizationSlug,
      createdAt: now,
      updatedAt: now,
    })
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
