import { queryKeys } from "@camox/api-contract/query-keys";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";

import { assertPageAccess, getAuthorizedProject } from "../../authorization";
import { broadcastInvalidation } from "../../lib/broadcast-invalidation";
import { resolveEnvironment } from "../../lib/resolve-environment";
import { scheduleAiJob } from "../../lib/schedule-ai-job";
import { blockDefinitions, blocks, layouts, pages, projects, repeatableItems } from "../../schema";
import type { ServiceContext } from "../_shared/service-context";
import {
  buildFileMap,
  collectFileIds,
  executePageSeo,
  generatePageDraftFromAi,
  sortByPosition,
} from "./ai";

const DEFAULT_HERO_BLOCK = {
  type: "hero",
  content: {
    title: "A page title",
    description: "An engaging block description",
    cta: { type: "external", text: "Get started", href: "/", newTab: false },
  },
};

// --- Input Schemas ---
// Exported so adapters (oRPC, MCP, CLI) share the same canonical contract.
// Services .parse() them on entry — service is the trust boundary.

export const getPageByPathInput = z.object({ projectSlug: z.string(), path: z.string() });
export const getPageStructureInput = z.object({ projectSlug: z.string(), path: z.string() });
export const listPagesInput = z.object({ projectId: z.number() });
export const listPagesBySlugInput = z.object({ projectSlug: z.string() });
export const getPageInput = z.object({ id: z.number() });

export const createPageInput = z.object({
  projectId: z.number(),
  pathSegment: z.string(),
  parentPageId: z.number().optional(),
  layoutId: z.number(),
  contentDescription: z.string().optional(),
});
export const updatePageInput = z.object({
  id: z.number(),
  pathSegment: z.string().optional(),
  parentPageId: z.number().nullable().optional(),
});
export const deletePageInput = z.object({ id: z.number() });
export const setPageAiSeoInput = z.object({ id: z.number(), enabled: z.boolean() });
export const setPageMetaTitleInput = z.object({ id: z.number(), metaTitle: z.string() });
export const setPageMetaDescriptionInput = z.object({
  id: z.number(),
  metaDescription: z.string(),
});
export const setPageLayoutInput = z.object({ id: z.number(), layoutId: z.number() });
export const generatePageSeoInput = z.object({ id: z.number() });

function assertUser(ctx: ServiceContext) {
  if (!ctx.user) throw new ORPCError("UNAUTHORIZED");
  return ctx.user;
}

function invalidatePage(ctx: ServiceContext, projectId: number, pageId: number) {
  broadcastInvalidation({
    waitUntil: ctx.waitUntil,
    projectRoomNamespace: ctx.env.ProjectRoom,
    projectId,
    targets: [queryKeys.pages.list, queryKeys.pages.getById(pageId)],
  });
}

// --- Reads ---

export async function getPageByPath(
  ctx: ServiceContext,
  rawInput: z.input<typeof getPageByPathInput>,
) {
  const { path: fullPath, projectSlug } = getPageByPathInput.parse(rawInput);
  const db = ctx.db;

  const project = await db.select().from(projects).where(eq(projects.slug, projectSlug)).get();
  if (!project) throw new ORPCError("NOT_FOUND");

  const environment = await resolveEnvironment(db, project.id, ctx.environmentName);

  const page = await db
    .select()
    .from(pages)
    .where(and(eq(pages.fullPath, fullPath), eq(pages.environmentId, environment.id)))
    .get();
  if (!page) throw new ORPCError("NOT_FOUND");

  const pageBlocks = sortByPosition(
    await db.select().from(blocks).where(eq(blocks.pageId, page.id)),
  );

  const layout = page.layoutId
    ? await db.select().from(layouts).where(eq(layouts.id, page.layoutId)).get()
    : null;

  const layoutBlocks = layout
    ? sortByPosition(await db.select().from(blocks).where(eq(blocks.layoutId, layout.id)))
    : [];

  const allBlocks = [...pageBlocks, ...layoutBlocks];
  const allBlockIds = allBlocks.map((b) => b.id);

  const allItems =
    allBlockIds.length > 0
      ? sortByPosition(
          await db
            .select()
            .from(repeatableItems)
            .where(inArray(repeatableItems.blockId, allBlockIds)),
        )
      : [];

  const topLevelItemsByBlockField = new Map<string, typeof allItems>();
  for (const item of allItems) {
    if (item.parentItemId !== null) continue;
    const key = `${item.blockId}:${item.fieldName}`;
    const list = topLevelItemsByBlockField.get(key) ?? [];
    list.push(item);
    topLevelItemsByBlockField.set(key, list);
  }

  const blocksWithMarkers = allBlocks.map((block) => {
    const content = { ...(block.content as Record<string, unknown>) };
    for (const [key, items] of topLevelItemsByBlockField) {
      if (!key.startsWith(`${block.id}:`)) continue;
      const fieldName = key.slice(String(block.id).length + 1);
      content[fieldName] = items.map((item) => ({ _itemId: item.id }));
    }
    return { ...block, content };
  });

  const fileIds = new Set<number>();
  for (const block of blocksWithMarkers) {
    collectFileIds(block.content as Record<string, unknown>, fileIds);
  }
  for (const item of allItems) {
    collectFileIds(item.content as Record<string, unknown>, fileIds);
  }

  const fileRows = await buildFileMap(db, fileIds);

  const blockIds = pageBlocks.map((b) => b.id);
  const beforeBlockIds = layoutBlocks.filter((b) => b.placement === "before").map((b) => b.id);
  const afterBlockIds = layoutBlocks.filter((b) => b.placement === "after").map((b) => b.id);

  return {
    page: { ...page, blockIds },
    projectName: project.name,
    layout: layout
      ? { id: layout.id, layoutId: layout.layoutId, beforeBlockIds, afterBlockIds }
      : null,
    blocks: blocksWithMarkers,
    repeatableItems: allItems,
    files: [...fileRows.values()],
  };
}

export async function getPageStructure(
  ctx: ServiceContext,
  rawInput: z.input<typeof getPageStructureInput>,
) {
  const { path: fullPath, projectSlug } = getPageStructureInput.parse(rawInput);
  const db = ctx.db;

  const project = await db.select().from(projects).where(eq(projects.slug, projectSlug)).get();
  if (!project) throw new ORPCError("NOT_FOUND");

  const environment = await resolveEnvironment(db, project.id, ctx.environmentName);

  const page = await db
    .select()
    .from(pages)
    .where(and(eq(pages.fullPath, fullPath), eq(pages.environmentId, environment.id)))
    .get();
  if (!page) throw new ORPCError("NOT_FOUND");

  const pageBlocks = sortByPosition(
    await db
      .select({ id: blocks.id, position: blocks.position })
      .from(blocks)
      .where(eq(blocks.pageId, page.id)),
  );

  const layout = page.layoutId
    ? await db.select().from(layouts).where(eq(layouts.id, page.layoutId)).get()
    : null;

  const layoutBlocks = layout
    ? sortByPosition(
        await db
          .select({ id: blocks.id, position: blocks.position, placement: blocks.placement })
          .from(blocks)
          .where(eq(blocks.layoutId, layout.id)),
      )
    : [];

  return {
    page: { ...page, blockIds: pageBlocks.map((b) => b.id) },
    projectName: project.name,
    layout: layout
      ? {
          id: layout.id,
          layoutId: layout.layoutId,
          beforeBlockIds: layoutBlocks.filter((b) => b.placement === "before").map((b) => b.id),
          afterBlockIds: layoutBlocks.filter((b) => b.placement === "after").map((b) => b.id),
        }
      : null,
  };
}

export async function listPages(ctx: ServiceContext, rawInput: z.input<typeof listPagesInput>) {
  const { projectId } = listPagesInput.parse(rawInput);
  const environment = await resolveEnvironment(ctx.db, projectId, ctx.environmentName);
  return await ctx.db
    .select()
    .from(pages)
    .where(and(eq(pages.projectId, projectId), eq(pages.environmentId, environment.id)));
}

export async function listPagesBySlug(
  ctx: ServiceContext,
  rawInput: z.input<typeof listPagesBySlugInput>,
) {
  const { projectSlug } = listPagesBySlugInput.parse(rawInput);
  const project = await ctx.db.select().from(projects).where(eq(projects.slug, projectSlug)).get();
  if (!project) throw new ORPCError("NOT_FOUND");

  const environment = await resolveEnvironment(ctx.db, project.id, ctx.environmentName);
  return await ctx.db
    .select()
    .from(pages)
    .where(and(eq(pages.projectId, project.id), eq(pages.environmentId, environment.id)));
}

export async function getPage(ctx: ServiceContext, rawInput: z.input<typeof getPageInput>) {
  const { id } = getPageInput.parse(rawInput);
  const result = await ctx.db.select().from(pages).where(eq(pages.id, id)).get();
  if (!result) throw new ORPCError("NOT_FOUND");
  return result;
}

// --- Writes ---

export async function createPage(ctx: ServiceContext, rawInput: z.input<typeof createPageInput>) {
  const user = assertUser(ctx);
  const { projectId, pathSegment, parentPageId, layoutId, contentDescription } =
    createPageInput.parse(rawInput);
  const project = await getAuthorizedProject(ctx.db, projectId, user.id);
  if (!project) throw new ORPCError("NOT_FOUND");
  const environment = await resolveEnvironment(ctx.db, projectId, ctx.environmentName);

  let generatedBlocks: {
    type: string;
    content: Record<string, unknown>;
    settings?: Record<string, unknown>;
  }[] = [DEFAULT_HERO_BLOCK];

  if (contentDescription) {
    try {
      const allDefs = await ctx.db
        .select()
        .from(blockDefinitions)
        .where(eq(blockDefinitions.projectId, projectId));
      const defs = allDefs.filter((d) => !d.layoutOnly);

      if (defs.length > 0) {
        generatedBlocks = await generatePageDraftFromAi(ctx.env.OPEN_ROUTER_API_KEY, {
          contentDescription,
          blockDefs: defs.map((d) => ({
            blockId: d.blockId,
            title: d.title,
            description: d.description ?? "",
            contentSchema: d.contentSchema,
            settingsSchema: d.settingsSchema ?? undefined,
          })),
        });
      }
    } catch (error) {
      console.error("AI generation failed, using default block:", error);
      generatedBlocks = [DEFAULT_HERO_BLOCK];
    }
  }

  let fullPath = `/${pathSegment}`;
  if (parentPageId) {
    const parent = await ctx.db.select().from(pages).where(eq(pages.id, parentPageId)).get();
    if (parent) {
      fullPath = `${parent.fullPath}/${pathSegment}`;
    }
  }

  const now = Date.now();
  const page = await ctx.db
    .insert(pages)
    .values({
      projectId,
      environmentId: environment.id,
      pathSegment,
      fullPath,
      parentPageId: parentPageId ?? null,
      layoutId,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  let prevPosition: string | null = null;
  for (const genBlock of generatedBlocks) {
    const position = generateKeyBetween(prevPosition, null);
    prevPosition = position;

    const scalarContent: Record<string, unknown> = {};
    const arrayFields: Record<string, unknown[]> = {};
    for (const [key, value] of Object.entries(genBlock.content)) {
      if (Array.isArray(value)) {
        arrayFields[key] = value;
      } else {
        scalarContent[key] = value;
      }
    }

    const block = await ctx.db
      .insert(blocks)
      .values({
        pageId: page.id,
        type: genBlock.type,
        content: scalarContent,
        settings: genBlock.settings ?? null,
        summary: "",
        position,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    for (const [fieldName, items] of Object.entries(arrayFields)) {
      let itemPrevPos: string | null = null;
      for (const itemContent of items) {
        const itemPos = generateKeyBetween(itemPrevPos, null);
        itemPrevPos = itemPos;
        await ctx.db.insert(repeatableItems).values({
          blockId: block.id,
          fieldName,
          content: itemContent,
          summary: "",
          position: itemPos,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    ctx.waitUntil(
      scheduleAiJob(ctx.env.AI_JOB_SCHEDULER, {
        entityTable: "blocks",
        entityId: block.id,
        type: "summary",
        delayMs: 0,
      }),
    );
  }

  invalidatePage(ctx, projectId, page.id);

  return { page, fullPath: page.fullPath };
}

export async function updatePage(ctx: ServiceContext, rawInput: z.input<typeof updatePageInput>) {
  const user = assertUser(ctx);
  const { id, ...body } = updatePageInput.parse(rawInput);
  const access = await assertPageAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  const result = await ctx.db
    .update(pages)
    .set({ ...body, updatedAt: Date.now() })
    .where(eq(pages.id, id))
    .returning()
    .get();
  invalidatePage(ctx, access.page.projectId, id);
  return result;
}

export async function deletePage(ctx: ServiceContext, rawInput: z.input<typeof deletePageInput>) {
  const user = assertUser(ctx);
  const { id } = deletePageInput.parse(rawInput);
  const access = await assertPageAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  const result = await ctx.db.delete(pages).where(eq(pages.id, id)).returning().get();
  invalidatePage(ctx, access.page.projectId, id);
  return result;
}

export async function setPageAiSeo(
  ctx: ServiceContext,
  rawInput: z.input<typeof setPageAiSeoInput>,
) {
  const user = assertUser(ctx);
  const { id, enabled } = setPageAiSeoInput.parse(rawInput);
  const access = await assertPageAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  const result = await ctx.db
    .update(pages)
    .set({ aiSeoEnabled: enabled, updatedAt: Date.now() })
    .where(eq(pages.id, id))
    .returning()
    .get();
  if (enabled) {
    ctx.waitUntil(
      scheduleAiJob(ctx.env.AI_JOB_SCHEDULER, {
        entityTable: "pages",
        entityId: id,
        type: "seo",
        delayMs: 0,
      }),
    );
  }
  invalidatePage(ctx, access.page.projectId, id);
  return result;
}

export async function setPageMetaTitle(
  ctx: ServiceContext,
  rawInput: z.input<typeof setPageMetaTitleInput>,
) {
  const user = assertUser(ctx);
  const { id, metaTitle } = setPageMetaTitleInput.parse(rawInput);
  const access = await assertPageAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  const result = await ctx.db
    .update(pages)
    .set({ metaTitle, updatedAt: Date.now() })
    .where(eq(pages.id, id))
    .returning()
    .get();
  invalidatePage(ctx, access.page.projectId, id);
  return result;
}

export async function setPageMetaDescription(
  ctx: ServiceContext,
  rawInput: z.input<typeof setPageMetaDescriptionInput>,
) {
  const user = assertUser(ctx);
  const { id, metaDescription } = setPageMetaDescriptionInput.parse(rawInput);
  const access = await assertPageAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  const result = await ctx.db
    .update(pages)
    .set({ metaDescription, updatedAt: Date.now() })
    .where(eq(pages.id, id))
    .returning()
    .get();
  invalidatePage(ctx, access.page.projectId, id);
  return result;
}

export async function setPageLayout(
  ctx: ServiceContext,
  rawInput: z.input<typeof setPageLayoutInput>,
) {
  const user = assertUser(ctx);
  const { id, layoutId } = setPageLayoutInput.parse(rawInput);
  const access = await assertPageAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  const result = await ctx.db
    .update(pages)
    .set({ layoutId, updatedAt: Date.now() })
    .where(eq(pages.id, id))
    .returning()
    .get();
  invalidatePage(ctx, access.page.projectId, id);
  return result;
}

export async function generatePageSeo(
  ctx: ServiceContext,
  rawInput: z.input<typeof generatePageSeoInput>,
) {
  const user = assertUser(ctx);
  const { id } = generatePageSeoInput.parse(rawInput);
  const access = await assertPageAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  await executePageSeo(ctx.db, ctx.env.OPEN_ROUTER_API_KEY, id);
  invalidatePage(ctx, access.page.projectId, id);
  const updated = await ctx.db.select().from(pages).where(eq(pages.id, id)).get();
  return updated;
}
