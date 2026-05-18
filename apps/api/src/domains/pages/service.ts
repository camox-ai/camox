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
import { writeLayoutCheckpointAndPoint } from "../layouts/service";
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
// `alsoPublishLayout` bundles the page's layout into the same publish in one
// transaction — checkbox in the page publish dialog. When `true` and the page
// has no layout, the flag is silently ignored. If the layout has no pending
// changes, we still write a fresh checkpoint; that's a no-op on the public
// site and simpler than gating the flag at this layer.
export const publishPageInput = z.object({
  id: z.number(),
  alsoPublishLayout: z.boolean().optional(),
});
export const unpublishPageInput = z.object({ id: z.number() });

// Snapshot shape version written into `page_checkpoints.schema_version`.
// One-way ratchet — bump and add a migration when the snapshot shape changes.
const PAGE_SNAPSHOT_SCHEMA_VERSION = 1;

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

// Publish / unpublish wholesale-invalidate the 'live' cache slots for the
// affected page and all its blocks. Published state never mutates piecewise
// (Phase 1 design note), so this is the only event in v1 that touches 'live'
// keys — at most once per click. The path prefix `getByPath(path)` (no
// source) hits both the draft and live slots for that path, which is correct:
// the draft slot also re-derives status after the pointer flips.
//
// The Phase 4 bundled-publish path (page + layout in one click) optionally
// piggybacks layout-side targets here so the broadcast is still single-shot:
// `layouts.all` for the layout list, plus the dependent pages' paths and
// every dependent block's `'live'` key for the cascade refresh.
function invalidatePagePublish(
  ctx: ServiceContext,
  args: {
    projectId: number;
    pageId: number;
    fullPath: string;
    blockIds: number[];
    layoutCascade?: {
      dependentPagePaths: string[];
      dependentBlockIds: number[];
      layoutBlockIds: number[];
    };
  },
) {
  const cascadeTargets = args.layoutCascade
    ? [
        queryKeys.layouts.all,
        ...args.layoutCascade.dependentPagePaths.map((p) => queryKeys.pages.getByPath(p)),
        ...args.layoutCascade.dependentBlockIds.map((id) => queryKeys.blocks.get(id, "live")),
        ...args.layoutCascade.layoutBlockIds.map((id) => queryKeys.blocks.get(id, "live")),
      ]
    : [];

  broadcastInvalidation({
    waitUntil: ctx.waitUntil,
    projectRoomNamespace: ctx.env.ProjectRoom,
    projectId: args.projectId,
    targets: [
      queryKeys.pages.list,
      queryKeys.pages.getById(args.pageId),
      // Prefix invalidation: both 'draft' and 'live' slots at this path.
      queryKeys.pages.getByPath(args.fullPath),
      ...args.blockIds.map((id) => queryKeys.blocks.get(id, "live")),
      ...cascadeTargets,
    ],
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

// Build a canonical page snapshot from the current live (draft) rows. Mirrors
// the migration's SQL `json_object(...)` shape (snapshotPageRowSchema +
// snapshotBlockSchema + snapshotRepeatableItemSchema) so the read path doesn't
// know whether it's looking at a migration-seeded checkpoint or one freshly
// minted by a Phase 3 publish.
//
// Blocks store their content with `_itemId` markers stripped — the read path
// re-injects them via injectRepeatableItemMarkers when composing a PageView.
async function buildPageSnapshotFromDraft(
  ctx: ServiceContext,
  page: typeof pages.$inferSelect,
): Promise<PageSnapshot> {
  const pageBlocks = sortByPosition(
    await ctx.db.select().from(blocks).where(eq(blocks.pageId, page.id)),
  );
  const blockIds = pageBlocks.map((b) => b.id);
  const items =
    blockIds.length > 0
      ? sortByPosition(
          await ctx.db
            .select()
            .from(repeatableItems)
            .where(inArray(repeatableItems.blockId, blockIds)),
        )
      : [];

  return {
    page: {
      id: page.id,
      projectId: page.projectId,
      environmentId: page.environmentId,
      pathSegment: page.pathSegment,
      fullPath: page.fullPath,
      parentPageId: page.parentPageId,
      layoutId: page.layoutId,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      aiSeoEnabled: page.aiSeoEnabled,
      customOgImageBlobId: page.customOgImageBlobId,
      customOgImageUrl: page.customOgImageUrl,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    },
    blocks: pageBlocks.map((b) => ({
      id: b.id,
      pageId: b.pageId,
      layoutId: b.layoutId,
      type: b.type,
      content: b.content,
      settings: b.settings,
      placement: b.placement,
      summary: b.summary,
      position: b.position,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
    repeatableItems: items.map((item) => ({
      id: item.id,
      blockId: item.blockId,
      parentItemId: item.parentItemId,
      fieldName: item.fieldName,
      content: item.content,
      settings: item.settings,
      summary: item.summary,
      position: item.position,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  };
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

// Promote the current draft to public: snapshot the live rows, write a new
// auto-publish checkpoint, point the page at it. The pointer update is the
// publish — that's the moment the public site changes. We run insert-then-
// update sequentially (D1 + drizzle has no shared-transaction primitive);
// a partial failure between the two steps leaves a checkpoint nothing points
// at, which is harmless history that no UI surfaces.
//
// `alsoPublishLayout` bundles a layout publish into the same call (Phase 4).
// The layout side runs first so its checkpoint exists before the page pointer
// flips — same trade-off on partial failure: an orphan layout checkpoint is
// harmless, but a published page pointing at unpublished layout data would
// not be. If the page has no layout, the flag is silently ignored. If the
// layout is clean, we still write a fresh checkpoint; that's a no-op for
// renderers and simpler than gating the flag.
export async function publishPage(ctx: ServiceContext, rawInput: z.input<typeof publishPageInput>) {
  const user = assertUser(ctx);
  const { id, alsoPublishLayout } = publishPageInput.parse(rawInput);
  const access = await assertPageAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  const pageRow = await ctx.db.select().from(pages).where(eq(pages.id, id)).get();
  if (!pageRow) throw new ORPCError("NOT_FOUND");

  let layoutCascade: {
    dependentPagePaths: string[];
    dependentBlockIds: number[];
    layoutBlockIds: number[];
  } | null = null;

  if (alsoPublishLayout && pageRow.layoutId != null) {
    const layoutRow = await ctx.db
      .select()
      .from(layouts)
      .where(eq(layouts.id, pageRow.layoutId))
      .get();
    if (layoutRow) {
      await writeLayoutCheckpointAndPoint(ctx, { layout: layoutRow, userId: user.id });

      // Build the cascade invalidation set in the same go — pages-using-layout
      // + their block ids + the layout's own block ids. One DB pass per set,
      // bundled with the page invalidation below so the broadcast is single-
      // shot. Excludes the page being published itself; its keys are already
      // in the base invalidation list.
      const dependentPages = await ctx.db
        .select({ id: pages.id, fullPath: pages.fullPath })
        .from(pages)
        .where(
          and(eq(pages.layoutId, layoutRow.id), eq(pages.environmentId, layoutRow.environmentId)),
        );
      const otherPageIds = dependentPages.map((p) => p.id).filter((pid) => pid !== id);
      const otherPagePaths = dependentPages.filter((p) => p.id !== id).map((p) => p.fullPath);
      const otherBlockIds =
        otherPageIds.length > 0
          ? (
              await ctx.db
                .select({ id: blocks.id })
                .from(blocks)
                .where(inArray(blocks.pageId, otherPageIds))
            ).map((b) => b.id)
          : [];
      const layoutBlockIds = (
        await ctx.db.select({ id: blocks.id }).from(blocks).where(eq(blocks.layoutId, layoutRow.id))
      ).map((b) => b.id);

      layoutCascade = {
        dependentPagePaths: otherPagePaths,
        dependentBlockIds: otherBlockIds,
        layoutBlockIds,
      };
    }
  }

  const { updated, snapshot } = await writePageCheckpointAndPoint(ctx, {
    page: pageRow,
    userId: user.id,
  });

  invalidatePagePublish(ctx, {
    projectId: access.page.projectId,
    pageId: id,
    fullPath: pageRow.fullPath,
    blockIds: snapshot.blocks.map((b) => b.id),
    ...(layoutCascade ? { layoutCascade } : {}),
  });

  return updated;
}

// The insert+pointer-update pair, factored so the project-init flow can reuse
// it without going through `publishPage` (which requires an authenticated
// user). Mirrors `writeLayoutCheckpointAndPoint`. D1 + drizzle has no shared-
// transaction primitive; a partial failure between insert and update leaves a
// checkpoint nothing points at, which is harmless history that no UI surfaces.
//
// `userId` is null for the project-init auto-publish (no authenticated user in
// the sync-secret flow); matches the migration backfill which also stored NULL.
export async function writePageCheckpointAndPoint(
  ctx: ServiceContext,
  args: { page: typeof pages.$inferSelect; userId: string | null },
) {
  const snapshot = await buildPageSnapshotFromDraft(ctx, args.page);
  const now = Date.now();

  const checkpoint = await ctx.db
    .insert(pageCheckpoints)
    .values({
      pageId: args.page.id,
      kind: "auto-publish",
      label: null,
      snapshot: JSON.stringify(snapshot),
      schemaVersion: PAGE_SNAPSHOT_SCHEMA_VERSION,
      createdAt: now,
      createdBy: args.userId,
    })
    .returning()
    .get();

  const updated = await ctx.db
    .update(pages)
    .set({ livePublishedCheckpointId: checkpoint.id, updatedAt: now })
    .where(eq(pages.id, args.page.id))
    .returning()
    .get();

  return { checkpoint, snapshot, updated };
}

// Clear the live pointer. The public router will start 404'ing for this page;
// the draft is untouched, and the previous auto-publish checkpoint stays in
// the DB so a future history-sidebar feature can re-point at it.
export async function unpublishPage(
  ctx: ServiceContext,
  rawInput: z.input<typeof unpublishPageInput>,
) {
  const user = assertUser(ctx);
  const { id } = unpublishPageInput.parse(rawInput);
  const access = await assertPageAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  const pageRow = await ctx.db.select().from(pages).where(eq(pages.id, id)).get();
  if (!pageRow) throw new ORPCError("NOT_FOUND");

  // Surface a clear error rather than silently no-op when the user hits
  // unpublish on a never-published page — the menu should already be
  // disabled in that case, but a stale UI shouldn't write garbage.
  if (pageRow.livePublishedCheckpointId == null) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Page is not published.",
    });
  }

  const now = Date.now();
  const updated = await ctx.db
    .update(pages)
    .set({ livePublishedCheckpointId: null, updatedAt: now })
    .where(eq(pages.id, id))
    .returning()
    .get();

  // Block-level 'live' caches still hold the previous published snapshot;
  // invalidate them so a subsequent Live preview (or public read on the path
  // that just became 404) doesn't render stale block content from the cache.
  const blockRows = await ctx.db
    .select({ id: blocks.id })
    .from(blocks)
    .where(eq(blocks.pageId, id));
  invalidatePagePublish(ctx, {
    projectId: access.page.projectId,
    pageId: id,
    fullPath: pageRow.fullPath,
    blockIds: blockRows.map((b) => b.id),
  });

  return updated;
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
