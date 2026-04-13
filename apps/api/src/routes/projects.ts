import { ORPCError } from "@orpc/server";
import { and, eq, inArray, or } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";

import { assertOrgMembership, assertSyncSecret, getAuthorizedProject } from "../authorization";
import { resolveEnvironment } from "../lib/resolve-environment";
import { generateUniqueSlug } from "../lib/slug";
import { authed, pub } from "../orpc";
import {
  aiJobs,
  blockDefinitions,
  blocks,
  environments,
  files,
  layouts,
  organizationTable,
  pages,
  projects,
  repeatableItems,
} from "../schema";

// --- Procedures ---

const createProjectSchema = z.object({
  name: z.string(),
  organizationId: z.string(),
});

const updateProjectSchema = z.object({
  name: z.string(),
});

const list = authed
  .input(z.object({ organizationId: z.string() }))
  .handler(async ({ context, input }) => {
    await assertOrgMembership(context.db, context.user.id, input.organizationId);
    return context.db
      .select()
      .from(projects)
      .where(eq(projects.organizationId, input.organizationId));
  });

const getFirst = authed
  .input(z.object({ organizationId: z.string() }))
  .handler(async ({ context, input }) => {
    await assertOrgMembership(context.db, context.user.id, input.organizationId);
    const result = await context.db
      .select()
      .from(projects)
      .where(eq(projects.organizationId, input.organizationId))
      .limit(1)
      .get();
    if (!result) throw new ORPCError("NOT_FOUND");
    return result;
  });

const getBySlug = authed
  .input(z.object({ slug: z.string() }))
  .handler(async ({ context, input }) => {
    const result = await context.db
      .select({
        project: projects,
        organizationSlug: organizationTable.slug,
      })
      .from(projects)
      .innerJoin(organizationTable, eq(organizationTable.id, projects.organizationId))
      .where(eq(projects.slug, input.slug))
      .get();
    if (!result) throw new ORPCError("NOT_FOUND");
    await assertOrgMembership(context.db, context.user.id, result.project.organizationId);
    return { ...result.project, organizationSlug: result.organizationSlug };
  });

const get = authed.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const result = await context.db
    .select({
      project: projects,
      organizationSlug: organizationTable.slug,
    })
    .from(projects)
    .innerJoin(organizationTable, eq(organizationTable.id, projects.organizationId))
    .where(eq(projects.id, input.id))
    .get();
  if (!result) throw new ORPCError("NOT_FOUND");
  await assertOrgMembership(context.db, context.user.id, result.project.organizationId);
  return { ...result.project, organizationSlug: result.organizationSlug };
});

const create = authed.input(createProjectSchema).handler(async ({ context, input }) => {
  await assertOrgMembership(context.db, context.user.id, input.organizationId);

  const slug = await generateUniqueSlug(context.db);
  const syncSecret = crypto.randomUUID();
  const now = Date.now();

  const result = await context.db
    .insert(projects)
    .values({
      name: input.name,
      slug,
      syncSecret,
      organizationId: input.organizationId,
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

  const projectId = project.id;

  // Collect IDs needed for cascade deletion
  const pageRows = await context.db
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.projectId, projectId));
  const pageIds = pageRows.map((r) => r.id);

  const layoutRows = await context.db
    .select({ id: layouts.id })
    .from(layouts)
    .where(eq(layouts.projectId, projectId));
  const layoutIds = layoutRows.map((r) => r.id);

  const blockConditions = [
    ...(pageIds.length > 0 ? [inArray(blocks.pageId, pageIds)] : []),
    ...(layoutIds.length > 0 ? [inArray(blocks.layoutId, layoutIds)] : []),
  ];
  const blockRows =
    blockConditions.length > 0
      ? await context.db
          .select({ id: blocks.id })
          .from(blocks)
          .where(or(...blockConditions))
      : [];
  const blockIds = blockRows.map((r) => r.id);

  const repeatableItemRows =
    blockIds.length > 0
      ? await context.db
          .select({ id: repeatableItems.id })
          .from(repeatableItems)
          .where(inArray(repeatableItems.blockId, blockIds))
      : [];
  const repeatableItemIds = repeatableItemRows.map((r) => r.id);

  const fileRows = await context.db
    .select({ id: files.id, blobId: files.blobId })
    .from(files)
    .where(eq(files.projectId, projectId));
  const fileIds = fileRows.map((r) => r.id);

  // Delete AI jobs for all collected entities
  const aiJobConditions = [
    ...(pageIds.length > 0
      ? [
          and(
            eq(aiJobs.entityTable, "pages"),
            inArray(
              aiJobs.entityId,
              pageIds.map((id) => String(id)),
            ),
          ),
        ]
      : []),
    ...(blockIds.length > 0
      ? [
          and(
            eq(aiJobs.entityTable, "blocks"),
            inArray(
              aiJobs.entityId,
              blockIds.map((id) => String(id)),
            ),
          ),
        ]
      : []),
    ...(repeatableItemIds.length > 0
      ? [
          and(
            eq(aiJobs.entityTable, "repeatableItems"),
            inArray(
              aiJobs.entityId,
              repeatableItemIds.map((id) => String(id)),
            ),
          ),
        ]
      : []),
    ...(fileIds.length > 0
      ? [
          and(
            eq(aiJobs.entityTable, "files"),
            inArray(
              aiJobs.entityId,
              fileIds.map((id) => String(id)),
            ),
          ),
        ]
      : []),
  ];
  if (aiJobConditions.length > 0) {
    await context.db.delete(aiJobs).where(or(...aiJobConditions));
  }

  // Delete in FK-safe order
  if (repeatableItemIds.length > 0) {
    await context.db.delete(repeatableItems).where(inArray(repeatableItems.id, repeatableItemIds));
  }
  if (blockIds.length > 0) {
    await context.db.delete(blocks).where(inArray(blocks.id, blockIds));
  }
  await context.db.delete(pages).where(eq(pages.projectId, projectId));

  // Delete files from R2 and database
  if (fileRows.length > 0) {
    await Promise.all(fileRows.map((f) => context.env.FILES_BUCKET.delete(f.blobId)));
    await context.db.delete(files).where(eq(files.projectId, projectId));
  }

  await context.db.delete(layouts).where(eq(layouts.projectId, projectId));
  await context.db.delete(blockDefinitions).where(eq(blockDefinitions.projectId, projectId));
  await context.db.delete(environments).where(eq(environments.projectId, projectId));

  const result = await context.db
    .delete(projects)
    .where(eq(projects.id, projectId))
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
  syncSecret: z.string(),
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

const initializeContent = pub.input(initializeContentSchema).handler(async ({ context, input }) => {
  const project = await assertSyncSecret(context.db, input.projectSlug, input.syncSecret);

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
      metaTitle: "Untitled page",
      metaDescription:
        "Title and description will be generated by AI as you edit the page's content.",
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
