import { queryKeys } from "@camox/api-contract/query-keys";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";

import { assertPageAccess, getAuthorizedProject } from "../../authorization";
import { broadcastInvalidation } from "../../lib/broadcast-invalidation";
import { resolveEnvironment } from "../../lib/resolve-environment";
import { scheduleAiJob } from "../../lib/schedule-ai-job";
import {
  blockDefinitions,
  blocks,
  layoutCheckpoints,
  layouts,
  pageCheckpoints,
  pages,
  projects,
  repeatableItems,
} from "../../schema";
import type { ServiceContext } from "../_shared/service-context";
import {
  layoutSnapshotSchema,
  pageSnapshotSchema,
  type LayoutSnapshot,
  type PageSnapshot,
  type SnapshotBlock,
  type SnapshotRepeatableItem,
} from "../_shared/snapshot-schemas";
import { normalizeBlockContent } from "../blocks/normalize-content";
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

// `source` selects the data plane the read serves from. Phase 1 of Draft &
// Publish: 'live' follows the page's live_published_checkpoint_id and parses
// the snapshot; 'draft' joins the live rows (today's behavior); the object
// form pins to a specific checkpoint id. Default is 'live' — the public SDK
// loader needs that, and the studio overrides explicitly with 'draft'.
export const pageSourceSchema = z.union([
  z.literal("live"),
  z.literal("draft"),
  z.object({ checkpointId: z.number() }),
]);
export type PageSource = z.infer<typeof pageSourceSchema>;

export const getPageByPathInput = z.object({
  projectSlug: z.string(),
  path: z.string(),
  source: pageSourceSchema.optional().default("live"),
});
export const getPageStructureInput = z.object({
  projectSlug: z.string(),
  path: z.string(),
  source: pageSourceSchema.optional().default("live"),
});
export const listPagesInput = z.object({ projectId: z.number() });
export const listPagesBySlugInput = z.object({ projectSlug: z.string() });
export const getPageInput = z.union([
  z.object({ id: z.number() }),
  z.object({ projectId: z.number(), path: z.string() }),
]);

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

function injectRepeatableItemMarkers<TBlock extends { id: number; content: unknown }>(
  block: TBlock,
  blockItems: (typeof repeatableItems.$inferSelect)[],
) {
  const childrenByParent = new Map<number | null, Map<string, typeof blockItems>>();
  for (const item of blockItems) {
    let fieldMap = childrenByParent.get(item.parentItemId);
    if (!fieldMap) {
      fieldMap = new Map();
      childrenByParent.set(item.parentItemId, fieldMap);
    }
    const list = fieldMap.get(item.fieldName) ?? [];
    list.push(item);
    fieldMap.set(item.fieldName, list);
  }

  const hasInlineArray = (content: Record<string, unknown>, key: string) => {
    const value = content[key];
    return Array.isArray(value) && value.length > 0;
  };

  const content = { ...(block.content as Record<string, unknown>) };
  const topLevelFields = childrenByParent.get(null);
  if (topLevelFields) {
    for (const [fieldName, fieldItems] of topLevelFields) {
      if (hasInlineArray(content, fieldName)) continue;
      content[fieldName] = fieldItems.map((item) => ({ _itemId: item.id }));
    }
  }

  const items = blockItems.map((item) => {
    const nestedFields = childrenByParent.get(item.id);
    if (!nestedFields) return item;

    const itemContent = { ...(item.content as Record<string, unknown>) };
    for (const [fieldName, fieldItems] of nestedFields) {
      if (hasInlineArray(itemContent, fieldName)) continue;
      itemContent[fieldName] = fieldItems.map((child) => ({ _itemId: child.id }));
    }
    return { ...item, content: itemContent };
  });

  return { block: { ...block, content }, items };
}

// --- Derived publish status ---
//
// Status is derived per page at read time — never stored. Cheap timestamp
// compare, no row scan: the page row carries `content_updated_at` (bumped on
// every block / repeatable-item mutation), the live checkpoint row carries
// `created_at`, and the same pair on the layout side feeds the cascade.

export type PageStatus = "draft" | "published" | "modified";
export type ModifiedReason =
  | { reason: "self" }
  | { reason: "layout"; layoutId: number; layoutHandle: string; affectedPagesCount: number }
  | { reason: "both"; layoutId: number; layoutHandle: string; affectedPagesCount: number };

export type PageStatusInfo = {
  status: PageStatus;
  modifiedReason: ModifiedReason | null;
};

type PageRow = typeof pages.$inferSelect;
type LayoutRow = typeof layouts.$inferSelect;

function deriveStatus(args: {
  page: Pick<PageRow, "livePublishedCheckpointId" | "contentUpdatedAt">;
  pageCheckpointCreatedAt: number | null;
  layout: Pick<
    LayoutRow,
    "id" | "layoutId" | "livePublishedCheckpointId" | "contentUpdatedAt"
  > | null;
  layoutCheckpointCreatedAt: number | null;
  layoutAffectedPagesCount: number;
}): PageStatusInfo {
  const {
    page,
    pageCheckpointCreatedAt,
    layout,
    layoutCheckpointCreatedAt,
    layoutAffectedPagesCount,
  } = args;

  // Never been published — no checkpoint pointer, or the checkpoint row is gone.
  if (page.livePublishedCheckpointId == null || pageCheckpointCreatedAt == null) {
    return { status: "draft", modifiedReason: null };
  }

  const pageSelfModified = page.contentUpdatedAt > pageCheckpointCreatedAt;
  // A layout with no live checkpoint, or with content past its live checkpoint,
  // counts as modified for the cascade — visitors see the published checkpoint,
  // so any drift on the layout side puts every dependent page out of sync.
  const layoutModified =
    layout != null &&
    (layout.livePublishedCheckpointId == null ||
      layoutCheckpointCreatedAt == null ||
      layout.contentUpdatedAt > layoutCheckpointCreatedAt);

  if (!pageSelfModified && !layoutModified) {
    return { status: "published", modifiedReason: null };
  }

  if (pageSelfModified && layoutModified && layout) {
    return {
      status: "modified",
      modifiedReason: {
        reason: "both",
        layoutId: layout.id,
        layoutHandle: layout.layoutId,
        affectedPagesCount: layoutAffectedPagesCount,
      },
    };
  }
  if (layoutModified && layout) {
    return {
      status: "modified",
      modifiedReason: {
        reason: "layout",
        layoutId: layout.id,
        layoutHandle: layout.layoutId,
        affectedPagesCount: layoutAffectedPagesCount,
      },
    };
  }
  return { status: "modified", modifiedReason: { reason: "self" } };
}

async function fetchPageStatuses(
  ctx: ServiceContext,
  pageRows: PageRow[],
  environmentId: number,
): Promise<Map<number, PageStatusInfo>> {
  const result = new Map<number, PageStatusInfo>();
  if (pageRows.length === 0) return result;
  const db = ctx.db;

  const pageCheckpointIds = pageRows
    .map((p) => p.livePublishedCheckpointId)
    .filter((id): id is number => id != null);
  const pageCheckpointCreatedAt = new Map<number, number>();
  if (pageCheckpointIds.length > 0) {
    const rows = await db
      .select({ id: pageCheckpoints.id, createdAt: pageCheckpoints.createdAt })
      .from(pageCheckpoints)
      .where(inArray(pageCheckpoints.id, pageCheckpointIds));
    for (const row of rows) pageCheckpointCreatedAt.set(row.id, row.createdAt);
  }

  const layoutIds = [
    ...new Set(pageRows.map((p) => p.layoutId).filter((id): id is number => id != null)),
  ];
  const layoutById = new Map<number, LayoutRow>();
  if (layoutIds.length > 0) {
    const rows = await db.select().from(layouts).where(inArray(layouts.id, layoutIds));
    for (const row of rows) layoutById.set(row.id, row);
  }

  const layoutCheckpointIds = [...layoutById.values()]
    .map((l) => l.livePublishedCheckpointId)
    .filter((id): id is number => id != null);
  const layoutCheckpointCreatedAt = new Map<number, number>();
  if (layoutCheckpointIds.length > 0) {
    const rows = await db
      .select({ id: layoutCheckpoints.id, createdAt: layoutCheckpoints.createdAt })
      .from(layoutCheckpoints)
      .where(inArray(layoutCheckpoints.id, layoutCheckpointIds));
    for (const row of rows) layoutCheckpointCreatedAt.set(row.id, row.createdAt);
  }

  // Count pages per layout in this environment — surfaces in the "affects N
  // pages" cascade tooltip. One GROUP BY, all layouts at once.
  const layoutPageCounts = new Map<number, number>();
  if (layoutIds.length > 0) {
    const rows = await db
      .select({ layoutId: pages.layoutId, count: sql<number>`count(*)` })
      .from(pages)
      .where(and(eq(pages.environmentId, environmentId), inArray(pages.layoutId, layoutIds)))
      .groupBy(pages.layoutId);
    for (const row of rows) {
      if (row.layoutId != null) layoutPageCounts.set(row.layoutId, Number(row.count));
    }
  }

  for (const page of pageRows) {
    const layout = page.layoutId != null ? (layoutById.get(page.layoutId) ?? null) : null;
    const pageCpAt =
      page.livePublishedCheckpointId != null
        ? (pageCheckpointCreatedAt.get(page.livePublishedCheckpointId) ?? null)
        : null;
    const layoutCpAt =
      layout?.livePublishedCheckpointId != null
        ? (layoutCheckpointCreatedAt.get(layout.livePublishedCheckpointId) ?? null)
        : null;
    const affected = layout != null ? (layoutPageCounts.get(layout.id) ?? 0) : 0;
    result.set(
      page.id,
      deriveStatus({
        page,
        pageCheckpointCreatedAt: pageCpAt,
        layout,
        layoutCheckpointCreatedAt: layoutCpAt,
        layoutAffectedPagesCount: affected,
      }),
    );
  }

  return result;
}

// --- Reads ---

// Snapshot reads return zod-parsed objects; live-row reads return drizzle's
// $inferSelect. The two are structurally identical (every column has the
// same shape), so SnapshotBlock / SnapshotRepeatableItem can stand in for
// both inside composePageView.
type RawBlock = SnapshotBlock;
type RawItem = SnapshotRepeatableItem;

async function readPageSnapshot(
  ctx: ServiceContext,
  pageRow: typeof pages.$inferSelect,
  source: PageSource,
): Promise<PageSnapshot | null> {
  let checkpointId: number | null = null;
  if (source === "live") {
    checkpointId = pageRow.livePublishedCheckpointId;
  } else if (typeof source === "object") {
    checkpointId = source.checkpointId;
  }
  if (checkpointId == null) return null;

  const checkpoint = await ctx.db
    .select()
    .from(pageCheckpoints)
    .where(eq(pageCheckpoints.id, checkpointId))
    .get();
  if (!checkpoint) return null;
  // When the caller pinned to a specific checkpoint id, refuse cross-page
  // reads so a leaked id can't be used to fetch a different page's content.
  if (typeof source === "object" && checkpoint.pageId !== pageRow.id) return null;

  return pageSnapshotSchema.parse(JSON.parse(checkpoint.snapshot));
}

async function readLayoutSnapshot(
  ctx: ServiceContext,
  layoutRow: typeof layouts.$inferSelect,
): Promise<LayoutSnapshot | null> {
  // Phase 1 contract: when composing a non-draft page read, the layout side
  // always resolves through its own live pointer. `{ checkpointId }` on a
  // page doesn't carry a layout-checkpoint reference yet (that lands when
  // entries arrive, see plans/draft-publish.md "Forward Compatibility").
  if (layoutRow.livePublishedCheckpointId == null) return null;
  const checkpoint = await ctx.db
    .select()
    .from(layoutCheckpoints)
    .where(eq(layoutCheckpoints.id, layoutRow.livePublishedCheckpointId))
    .get();
  if (!checkpoint) return null;
  return layoutSnapshotSchema.parse(JSON.parse(checkpoint.snapshot));
}

function composePageView(args: {
  page: typeof pages.$inferSelect;
  project: typeof projects.$inferSelect;
  layout: typeof layouts.$inferSelect | null;
  pageBlocks: RawBlock[];
  layoutBlocks: RawBlock[];
  allItems: RawItem[];
  fileRows: Map<number, typeof import("../../schema").files.$inferSelect>;
}) {
  const { page, project, layout, pageBlocks, layoutBlocks, allItems, fileRows } = args;

  const allBlocks = [...pageBlocks, ...layoutBlocks];

  const itemsByBlock = new Map<number, RawItem[]>();
  for (const item of allItems) {
    const list = itemsByBlock.get(item.blockId) ?? [];
    list.push(item);
    itemsByBlock.set(item.blockId, list);
  }

  const normalizedBlocks = allBlocks.map((block) =>
    injectRepeatableItemMarkers(block, itemsByBlock.get(block.id) ?? []),
  );
  const blocksWithMarkers = normalizedBlocks.map(({ block }) => block);
  const itemsWithMarkers = normalizedBlocks.flatMap(({ items }) => items);

  const blockIds = pageBlocks.map((b) => b.id);
  const beforeBlockIds = layoutBlocks.filter((b) => b.placement === "before").map((b) => b.id);
  const afterBlockIds = layoutBlocks.filter((b) => b.placement === "after").map((b) => b.id);

  return {
    page: { ...page, blockIds },
    projectName: project.name,
    // `id` + `updatedAt` are enough for the SDK to build a cache-busted
    // favicon URL (`/favicons/${id}?v=${updatedAt}`) in the page <head>.
    project: { id: project.id, updatedAt: project.updatedAt },
    layout: layout
      ? { id: layout.id, layoutId: layout.layoutId, beforeBlockIds, afterBlockIds }
      : null,
    blocks: blocksWithMarkers,
    repeatableItems: itemsWithMarkers,
    files: [...fileRows.values()],
  };
}

export async function getPageByPath(
  ctx: ServiceContext,
  rawInput: z.input<typeof getPageByPathInput>,
) {
  const { path: fullPath, projectSlug, source } = getPageByPathInput.parse(rawInput);
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

  const layout = page.layoutId
    ? ((await db.select().from(layouts).where(eq(layouts.id, page.layoutId)).get()) ?? null)
    : null;

  let pageBlocks: RawBlock[];
  let layoutBlocks: RawBlock[];
  let allItems: RawItem[];

  if (source === "draft") {
    pageBlocks = sortByPosition(await db.select().from(blocks).where(eq(blocks.pageId, page.id)));
    layoutBlocks = layout
      ? sortByPosition(await db.select().from(blocks).where(eq(blocks.layoutId, layout.id)))
      : [];
    const allBlockIds = [...pageBlocks, ...layoutBlocks].map((b) => b.id);
    allItems =
      allBlockIds.length > 0
        ? sortByPosition(
            await db
              .select()
              .from(repeatableItems)
              .where(inArray(repeatableItems.blockId, allBlockIds)),
          )
        : [];
  } else {
    const pageSnapshot = await readPageSnapshot(ctx, page, source);
    if (!pageSnapshot) throw new ORPCError("NOT_FOUND");
    pageBlocks = pageSnapshot.blocks;
    const pageItems = pageSnapshot.repeatableItems;

    let layoutItems: RawItem[] = [];
    if (layout) {
      const layoutSnapshot = await readLayoutSnapshot(ctx, layout);
      layoutBlocks = layoutSnapshot?.blocks ?? [];
      layoutItems = layoutSnapshot?.repeatableItems ?? [];
    } else {
      layoutBlocks = [];
    }
    allItems = [...pageItems, ...layoutItems];
  }

  const fileIds = new Set<number>();
  for (const block of [...pageBlocks, ...layoutBlocks]) {
    collectFileIds(block.content as Record<string, unknown>, fileIds);
  }
  for (const item of allItems) {
    collectFileIds(item.content as Record<string, unknown>, fileIds);
  }

  const fileRows = await buildFileMap(db, fileIds);

  const statuses = await fetchPageStatuses(ctx, [page], environment.id);
  const statusInfo = statuses.get(page.id) ?? { status: "draft" as const, modifiedReason: null };

  const view = composePageView({
    page,
    project,
    layout,
    pageBlocks,
    layoutBlocks,
    allItems,
    fileRows,
  });
  return { ...view, page: { ...view.page, ...statusInfo } };
}

export async function getPageStructure(
  ctx: ServiceContext,
  rawInput: z.input<typeof getPageStructureInput>,
) {
  const { path: fullPath, projectSlug, source } = getPageStructureInput.parse(rawInput);
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

  const layout = page.layoutId
    ? ((await db.select().from(layouts).where(eq(layouts.id, page.layoutId)).get()) ?? null)
    : null;

  let pageBlockOrder: { id: number; position: string }[];
  let layoutBlockOrder: { id: number; position: string; placement: "before" | "after" | null }[];

  if (source === "draft") {
    pageBlockOrder = sortByPosition(
      await db
        .select({ id: blocks.id, position: blocks.position })
        .from(blocks)
        .where(eq(blocks.pageId, page.id)),
    );
    layoutBlockOrder = layout
      ? sortByPosition(
          await db
            .select({ id: blocks.id, position: blocks.position, placement: blocks.placement })
            .from(blocks)
            .where(eq(blocks.layoutId, layout.id)),
        )
      : [];
  } else {
    const pageSnapshot = await readPageSnapshot(ctx, page, source);
    if (!pageSnapshot) throw new ORPCError("NOT_FOUND");
    pageBlockOrder = pageSnapshot.blocks.map((b) => ({ id: b.id, position: b.position }));
    if (layout) {
      const layoutSnapshot = await readLayoutSnapshot(ctx, layout);
      layoutBlockOrder = (layoutSnapshot?.blocks ?? []).map((b) => ({
        id: b.id,
        position: b.position,
        placement: b.placement,
      }));
    } else {
      layoutBlockOrder = [];
    }
  }

  const statuses = await fetchPageStatuses(ctx, [page], environment.id);
  const statusInfo = statuses.get(page.id) ?? { status: "draft" as const, modifiedReason: null };

  return {
    page: { ...page, blockIds: pageBlockOrder.map((b) => b.id), ...statusInfo },
    projectName: project.name,
    project: { id: project.id, updatedAt: project.updatedAt },
    layout: layout
      ? {
          id: layout.id,
          layoutId: layout.layoutId,
          beforeBlockIds: layoutBlockOrder.filter((b) => b.placement === "before").map((b) => b.id),
          afterBlockIds: layoutBlockOrder.filter((b) => b.placement === "after").map((b) => b.id),
        }
      : null,
  };
}

export async function listPages(ctx: ServiceContext, rawInput: z.input<typeof listPagesInput>) {
  const { projectId } = listPagesInput.parse(rawInput);
  const environment = await resolveEnvironment(ctx.db, projectId, ctx.environmentName);
  const rows = await ctx.db
    .select()
    .from(pages)
    .where(and(eq(pages.projectId, projectId), eq(pages.environmentId, environment.id)));
  const statuses = await fetchPageStatuses(ctx, rows, environment.id);
  return rows.map((page) => ({
    ...page,
    ...(statuses.get(page.id) ?? { status: "draft" as const, modifiedReason: null }),
  }));
}

export async function listPagesBySlug(
  ctx: ServiceContext,
  rawInput: z.input<typeof listPagesBySlugInput>,
) {
  const { projectSlug } = listPagesBySlugInput.parse(rawInput);
  const project = await ctx.db.select().from(projects).where(eq(projects.slug, projectSlug)).get();
  if (!project) throw new ORPCError("NOT_FOUND");

  const environment = await resolveEnvironment(ctx.db, project.id, ctx.environmentName);
  const rows = await ctx.db
    .select()
    .from(pages)
    .where(and(eq(pages.projectId, project.id), eq(pages.environmentId, environment.id)));
  const statuses = await fetchPageStatuses(ctx, rows, environment.id);
  return rows.map((page) => ({
    ...page,
    ...(statuses.get(page.id) ?? { status: "draft" as const, modifiedReason: null }),
  }));
}

export async function getPage(ctx: ServiceContext, rawInput: z.input<typeof getPageInput>) {
  const parsed = getPageInput.parse(rawInput);
  if ("id" in parsed) {
    const result = await ctx.db.select().from(pages).where(eq(pages.id, parsed.id)).get();
    if (!result) throw new ORPCError("NOT_FOUND");
    return result;
  }
  const environment = await resolveEnvironment(ctx.db, parsed.projectId, ctx.environmentName);
  const result = await ctx.db
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.projectId, parsed.projectId),
        eq(pages.environmentId, environment.id),
        eq(pages.fullPath, parsed.path),
      ),
    )
    .get();
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
  // Lookup used by the seed-insertion loop below to normalize each generated
  // block's content (extract Repeater arrays into seeds, sanitize asset
  // leaks). Empty when contentDescription is unset — the default hero block
  // has no asset fields, so a no-op normalization is fine.
  const schemaByType = new Map<string, unknown>();

  if (contentDescription) {
    try {
      const allDefs = await ctx.db
        .select()
        .from(blockDefinitions)
        .where(eq(blockDefinitions.projectId, projectId));
      for (const d of allDefs) schemaByType.set(d.blockId, d.contentSchema);
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
      contentUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  let prevPosition: string | null = null;
  for (const genBlock of generatedBlocks) {
    const position = generateKeyBetween(prevPosition, null);
    prevPosition = position;

    const { content: normalizedContent, seeds } = normalizeBlockContent(
      genBlock.content,
      schemaByType.get(genBlock.type) ?? null,
    );

    const block = await ctx.db
      .insert(blocks)
      .values({
        pageId: page.id,
        type: genBlock.type,
        content: normalizedContent,
        settings: genBlock.settings ?? null,
        summary: "",
        position,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    if (seeds.length > 0) {
      const tempIdToRealId = new Map<string, number>();
      for (const seed of seeds) {
        const parentItemId = seed.parentTempId
          ? (tempIdToRealId.get(seed.parentTempId) ?? null)
          : null;
        const inserted = await ctx.db
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
