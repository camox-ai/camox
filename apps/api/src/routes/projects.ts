import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";

import { assertOrgMembership, getAuthorizedProject } from "../authorization";
import { resolveEnvironment } from "../lib/resolve-environment";
import { generateUniqueSlug } from "../lib/slug";
import { authed, synced } from "../orpc";
import { blocks, environments, layouts, pages, projects, repeatableItems } from "../schema";

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

const repeatableItemSeedSchema = z.object({
  tempId: z.string(),
  parentTempId: z.string().nullable(),
  fieldName: z.string(),
  content: z.unknown(),
  position: z.string(),
});

const initializeContentSchema = z.object({
  projectSlug: z.string(),
  layoutId: z.string(),
  blocks: z.array(
    z.object({
      type: z.string(),
      content: z.unknown(),
      settings: z.unknown().optional(),
      repeatableItems: z.array(repeatableItemSeedSchema).optional(),
    }),
  ),
});

const initializeContent = synced
  .input(initializeContentSchema)
  .handler(async ({ context, input }) => {
    const project = await context.db
      .select()
      .from(projects)
      .where(eq(projects.slug, input.projectSlug))
      .get();
    if (!project) throw new ORPCError("NOT_FOUND");

    const environment = await resolveEnvironment(context.db, project.id, context.environmentName);

    // Check if environment already has pages — if so, skip (idempotent)
    const existingPage = await context.db
      .select()
      .from(pages)
      .where(eq(pages.environmentId, environment.id))
      .limit(1)
      .get();
    if (existingPage) {
      return { created: false };
    }

    const now = Date.now();

    // Find the specified layout
    const layout = await context.db
      .select()
      .from(layouts)
      .where(
        and(
          eq(layouts.projectId, project.id),
          eq(layouts.environmentId, environment.id),
          eq(layouts.layoutId, input.layoutId),
        ),
      )
      .get();
    if (!layout) {
      return { created: false };
    }

    // Create homepage
    const homepage = await context.db
      .insert(pages)
      .values({
        projectId: project.id,
        environmentId: environment.id,
        pathSegment: "",
        fullPath: "/",
        layoutId: layout.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // Create blocks on the homepage
    let prevPosition: string | null = null;
    let blockCount = 0;

    for (const blockDef of input.blocks) {
      const position = generateKeyBetween(prevPosition, null);
      prevPosition = position;

      const block = await context.db
        .insert(blocks)
        .values({
          pageId: homepage.id,
          type: blockDef.type,
          content: blockDef.content,
          settings: blockDef.settings ?? null,
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

      blockCount++;
    }

    return { created: true, pageId: homepage.id, blockCount };
  });

export const projectProcedures = {
  list,
  getFirst,
  getBySlug,
  get,
  create,
  update,
  delete: deleteFn,
  initializeContent,
};
