import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { assertOrgMembership, getAuthorizedProject } from "../authorization";
import { generateUniqueSlug } from "../lib/slug";
import { authed } from "../orpc";
import { environments, projects } from "../schema";

// --- Procedures ---

const createProjectSchema = z.object({
  name: z.string(),
  organizationSlug: z.string(),
});

const updateProjectSchema = z.object({
  name: z.string(),
});

const list = authed
  .input(z.object({ organizationSlug: z.string() }))
  .handler(async ({ context, input }) => {
    await assertOrgMembership(context.db, context.user.id, input.organizationSlug);
    return context.db
      .select()
      .from(projects)
      .where(eq(projects.organizationSlug, input.organizationSlug));
  });

const getFirst = authed
  .input(z.object({ organizationSlug: z.string() }))
  .handler(async ({ context, input }) => {
    await assertOrgMembership(context.db, context.user.id, input.organizationSlug);
    const result = await context.db
      .select()
      .from(projects)
      .where(eq(projects.organizationSlug, input.organizationSlug))
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
    if (!result) throw new ORPCError("NOT_FOUND");
    await assertOrgMembership(context.db, context.user.id, result.organizationSlug);
    return result;
  });

const get = authed.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const result = await context.db.select().from(projects).where(eq(projects.id, input.id)).get();
  if (!result) throw new ORPCError("NOT_FOUND");
  await assertOrgMembership(context.db, context.user.id, result.organizationSlug);
  return result;
});

const create = authed.input(createProjectSchema).handler(async ({ context, input }) => {
  await assertOrgMembership(context.db, context.user.id, input.organizationSlug);

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

  await context.db.insert(environments).values({
    projectId: result.id,
    name: "production",
    type: "production",
    createdAt: now,
    updatedAt: now,
  });

  return result;
});

const update = authed
  .input(updateProjectSchema.extend({ id: z.number() }))
  .handler(async ({ context, input }) => {
    const { id, ...body } = input;
    const project = await getAuthorizedProject(context.db, id, context.user.id);
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
  const project = await getAuthorizedProject(context.db, input.id, context.user.id);
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
