import { queryKeys } from "@camox/api-contract/query-keys";
import { ORPCError } from "@orpc/server";
import { eq, inArray, or } from "drizzle-orm";
import { z } from "zod";

import { getAuthorizedProject } from "../../authorization";
import type { Database } from "../../db";
import { broadcastInvalidation } from "../../lib/broadcast-invalidation";
import { type JsonValue, remapFileReferences } from "../../lib/remap-file-references";
import { resolveEnvironment } from "../../lib/resolve-environment";
import { stableStringify } from "../../lib/stable-stringify";
import { blockDefinitions, blocks, files, layouts, pages, repeatableItems } from "../../schema";
import type { ServiceContext } from "../_shared/service-context";

// --- Input Schemas ---

export const checkCompatibilityInput = z.object({
  projectId: z.number(),
  sourceEnvName: z.string(),
  targetEnvName: z.string(),
});

export const replicateEnvironmentInput = z.object({
  projectId: z.number(),
  sourceEnvName: z.string(),
  targetEnvName: z.string(),
});

// --- Compatibility reasons ---
//
// Returned (and re-emitted via the FAILED_PRECONDITION error payload) so the
// studio can render a clear "Cannot push because…" message per offending key.

export type CompatibilityReason =
  | { kind: "block-definition-missing-in-source"; blockId: string }
  | { kind: "block-definition-missing-in-target"; blockId: string }
  | {
      kind: "block-definition-schema-mismatch";
      blockId: string;
      field: "contentSchema" | "settingsSchema" | "layoutOnly";
    }
  | { kind: "layout-missing-in-source"; layoutId: string }
  | { kind: "layout-missing-in-target"; layoutId: string };

function assertUser(ctx: ServiceContext) {
  if (!ctx.user) throw new ORPCError("UNAUTHORIZED");
  return ctx.user;
}

/**
 * Walks block definitions and layouts in both envs and emits a reason for
 * every divergence. An empty result means push/pull is safe.
 *
 * Block definitions: every text-keyed `blockId` must exist in both envs and
 * agree on `contentSchema`, `settingsSchema`, and `layoutOnly`. Documentation
 * fields (`title`, `description`, `defaultContent`, `defaultSettings`) are
 * intentionally ignored — they don't affect content validity.
 *
 * Layouts: the set of text-keyed `layoutId`s must match exactly. Layouts have
 * no schema of their own to compare.
 */
async function collectCompatibilityReasons(
  db: Database,
  sourceEnvId: number,
  targetEnvId: number,
): Promise<CompatibilityReason[]> {
  const reasons: CompatibilityReason[] = [];

  // --- Block definitions ---
  const sourceDefs = await db
    .select()
    .from(blockDefinitions)
    .where(eq(blockDefinitions.environmentId, sourceEnvId));
  const targetDefs = await db
    .select()
    .from(blockDefinitions)
    .where(eq(blockDefinitions.environmentId, targetEnvId));

  const sourceByKey = new Map(sourceDefs.map((def) => [def.blockId, def]));
  const targetByKey = new Map(targetDefs.map((def) => [def.blockId, def]));
  const allBlockKeys = new Set([...sourceByKey.keys(), ...targetByKey.keys()]);

  for (const blockId of allBlockKeys) {
    const src = sourceByKey.get(blockId);
    const tgt = targetByKey.get(blockId);
    if (!src) {
      reasons.push({ kind: "block-definition-missing-in-source", blockId });
      continue;
    }
    if (!tgt) {
      reasons.push({ kind: "block-definition-missing-in-target", blockId });
      continue;
    }
    if (stableStringify(src.contentSchema) !== stableStringify(tgt.contentSchema)) {
      reasons.push({ kind: "block-definition-schema-mismatch", blockId, field: "contentSchema" });
    }
    if (stableStringify(src.settingsSchema) !== stableStringify(tgt.settingsSchema)) {
      reasons.push({ kind: "block-definition-schema-mismatch", blockId, field: "settingsSchema" });
    }
    // `layoutOnly` is `boolean | null`; normalise null/undefined to compare.
    if ((src.layoutOnly ?? null) !== (tgt.layoutOnly ?? null)) {
      reasons.push({ kind: "block-definition-schema-mismatch", blockId, field: "layoutOnly" });
    }
  }

  // --- Layouts ---
  const sourceLayoutRows = await db
    .select({ layoutId: layouts.layoutId })
    .from(layouts)
    .where(eq(layouts.environmentId, sourceEnvId));
  const targetLayoutRows = await db
    .select({ layoutId: layouts.layoutId })
    .from(layouts)
    .where(eq(layouts.environmentId, targetEnvId));

  const sourceLayoutKeys = new Set(sourceLayoutRows.map((row) => row.layoutId));
  const targetLayoutKeys = new Set(targetLayoutRows.map((row) => row.layoutId));

  for (const layoutId of sourceLayoutKeys) {
    if (!targetLayoutKeys.has(layoutId)) {
      reasons.push({ kind: "layout-missing-in-target", layoutId });
    }
  }
  for (const layoutId of targetLayoutKeys) {
    if (!sourceLayoutKeys.has(layoutId)) {
      reasons.push({ kind: "layout-missing-in-source", layoutId });
    }
  }

  return reasons;
}

// --- checkCompatibility ---

export async function checkCompatibility(
  ctx: ServiceContext,
  rawInput: z.input<typeof checkCompatibilityInput>,
) {
  const user = assertUser(ctx);
  const { projectId, sourceEnvName, targetEnvName } = checkCompatibilityInput.parse(rawInput);

  if (sourceEnvName === targetEnvName) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Source and target environments must differ",
    });
  }

  const project = await getAuthorizedProject(ctx.db, projectId, user.id);
  if (!project) throw new ORPCError("NOT_FOUND");

  const source = await resolveEnvironment(ctx.db, projectId, sourceEnvName);
  const target = await resolveEnvironment(ctx.db, projectId, targetEnvName);

  const reasons = await collectCompatibilityReasons(ctx.db, source.id, target.id);
  return { compatible: reasons.length === 0, reasons };
}

// --- Insertion-order helpers ---

/**
 * Orders pages root-first by `fullPath` depth, so any `parentPageId` we look
 * up in `pagesMap` was already inserted on a prior iteration.
 */
function sortPagesByDepth<T extends { fullPath: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.fullPath.split("/").length - b.fullPath.split("/").length);
}

/**
 * BFS from null-parent roots, so any `parentItemId` we look up in `itemsMap`
 * was already inserted on a prior iteration. Orphaned items (whose parent is
 * not in the input set) are appended at the end and will be remapped to a
 * null parent at insert time.
 */
function topoSortItems<T extends { id: number; parentItemId: number | null }>(items: T[]): T[] {
  const byParent = new Map<number | null, T[]>();
  for (const item of items) {
    const list = byParent.get(item.parentItemId) ?? [];
    list.push(item);
    byParent.set(item.parentItemId, list);
  }

  const sorted: T[] = [];
  const seen = new Set<number>();
  const queue: Array<number | null> = [null];
  while (queue.length > 0) {
    const parent = queue.shift() as number | null;
    const children = byParent.get(parent) ?? [];
    for (const child of children) {
      if (seen.has(child.id)) continue;
      sorted.push(child);
      seen.add(child.id);
      queue.push(child.id);
    }
  }
  // Pick up any items whose parent isn't in the input set; treat them as roots.
  for (const item of items) {
    if (!seen.has(item.id)) {
      sorted.push(item);
      seen.add(item.id);
    }
  }
  return sorted;
}

// --- replicateEnvironment ---

export async function replicateEnvironment(
  ctx: ServiceContext,
  rawInput: z.input<typeof replicateEnvironmentInput>,
) {
  const user = assertUser(ctx);
  const { projectId, sourceEnvName, targetEnvName } = replicateEnvironmentInput.parse(rawInput);

  if (sourceEnvName === targetEnvName) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Source and target environments must differ",
    });
  }

  // Phase 0 — authorize & resolve --------------------------------------------
  const project = await getAuthorizedProject(ctx.db, projectId, user.id);
  if (!project) throw new ORPCError("NOT_FOUND");

  const source = await resolveEnvironment(ctx.db, projectId, sourceEnvName);
  const target = await resolveEnvironment(ctx.db, projectId, targetEnvName);

  // Phase 1 — compatibility check --------------------------------------------
  const reasons = await collectCompatibilityReasons(ctx.db, source.id, target.id);
  if (reasons.length > 0) {
    throw new ORPCError("FAILED_PRECONDITION", {
      message: "Environments are incompatible — see data.reasons.",
      data: { reasons },
    });
  }

  // Phase 2 — snapshot the source environment --------------------------------
  // Read every env-scoped row, plus blocks/items via parent FKs. Empty source
  // is allowed and yields an empty snapshot (target ends up wiped).
  const sourceLayouts = await ctx.db
    .select()
    .from(layouts)
    .where(eq(layouts.environmentId, source.id));
  const sourceBlockDefs = await ctx.db
    .select()
    .from(blockDefinitions)
    .where(eq(blockDefinitions.environmentId, source.id));
  const sourceFiles = await ctx.db.select().from(files).where(eq(files.environmentId, source.id));
  const sourcePages = await ctx.db.select().from(pages).where(eq(pages.environmentId, source.id));

  const sourcePageIds = sourcePages.map((p) => p.id);
  const sourceLayoutPkIds = sourceLayouts.map((l) => l.id);

  // Blocks live under either a page or a layout. Skip the SQL entirely when
  // both parent sets are empty — `inArray(col, [])` would generate `IN ()`.
  let sourceBlocks: (typeof blocks.$inferSelect)[] = [];
  if (sourcePageIds.length > 0 && sourceLayoutPkIds.length > 0) {
    sourceBlocks = await ctx.db
      .select()
      .from(blocks)
      .where(
        or(inArray(blocks.pageId, sourcePageIds), inArray(blocks.layoutId, sourceLayoutPkIds)),
      );
  } else if (sourcePageIds.length > 0) {
    sourceBlocks = await ctx.db.select().from(blocks).where(inArray(blocks.pageId, sourcePageIds));
  } else if (sourceLayoutPkIds.length > 0) {
    sourceBlocks = await ctx.db
      .select()
      .from(blocks)
      .where(inArray(blocks.layoutId, sourceLayoutPkIds));
  }

  const sourceBlockIds = sourceBlocks.map((b) => b.id);
  const sourceItems: (typeof repeatableItems.$inferSelect)[] =
    sourceBlockIds.length > 0
      ? await ctx.db
          .select()
          .from(repeatableItems)
          .where(inArray(repeatableItems.blockId, sourceBlockIds))
      : [];

  const takenAt = Date.now();
  const snapshot = {
    schemaVersion: 1 as const,
    takenAt,
    source: { envId: source.id, envName: source.name },
    target: { envId: target.id, envName: target.name },
    layouts: sourceLayouts,
    blockDefinitions: sourceBlockDefs,
    files: sourceFiles,
    pages: sourcePages,
    blocks: sourceBlocks,
    repeatableItems: sourceItems,
  };
  const snapshotKey = `${projectId}/env-snapshots/${target.name}/${takenAt}.json`;
  await ctx.env.FILES_BUCKET.put(snapshotKey, JSON.stringify(snapshot), {
    httpMetadata: { contentType: "application/json" },
  });

  // Phase 3 — wipe the target environment ------------------------------------
  // Order matters: pages must go before layouts (pages.layout_id has no
  // ON DELETE CASCADE), and the files DELETE bypasses the per-row service so
  // R2 blobs are preserved for re-insertion below.
  await ctx.db.delete(pages).where(eq(pages.environmentId, target.id));
  await ctx.db.delete(layouts).where(eq(layouts.environmentId, target.id));
  await ctx.db.delete(blockDefinitions).where(eq(blockDefinitions.environmentId, target.id));
  await ctx.db.delete(files).where(eq(files.environmentId, target.id));

  // Phase 4 — re-insert into target, with ID remapping -----------------------

  const layoutsMap = new Map<number, number>();
  for (const row of sourceLayouts) {
    const { id, environmentId: _envId, ...rest } = row;
    const inserted = await ctx.db
      .insert(layouts)
      .values({ ...rest, environmentId: target.id })
      .returning()
      .get();
    layoutsMap.set(id, inserted.id);
  }

  // Block definitions have no incoming FKs from env-scoped tables, so there's
  // nothing to remap after insert.
  for (const row of sourceBlockDefs) {
    const { id: _id, environmentId: _envId, ...rest } = row;
    await ctx.db.insert(blockDefinitions).values({ ...rest, environmentId: target.id });
  }

  // Files: `blobId`, `path`, `url`, etc. are copied verbatim. Multiple rows
  // pointing at the same R2 object is intentional — refcount-aware deletion
  // (Phase 1) keeps blobs alive while any env still references them.
  const filesMap = new Map<number, number>();
  for (const row of sourceFiles) {
    const { id, environmentId: _envId, ...rest } = row;
    const inserted = await ctx.db
      .insert(files)
      .values({ ...rest, environmentId: target.id })
      .returning()
      .get();
    filesMap.set(id, inserted.id);
  }

  const pagesMap = new Map<number, number>();
  for (const row of sortPagesByDepth(sourcePages)) {
    const { id, environmentId: _envId, parentPageId, layoutId, ...rest } = row;
    const newLayoutId = layoutsMap.get(layoutId);
    if (newLayoutId === undefined) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: `Page ${id} references missing layout ${layoutId} during replication.`,
      });
    }
    const newParentPageId = parentPageId !== null ? (pagesMap.get(parentPageId) ?? null) : null;
    const inserted = await ctx.db
      .insert(pages)
      .values({
        ...rest,
        environmentId: target.id,
        parentPageId: newParentPageId,
        layoutId: newLayoutId,
      })
      .returning()
      .get();
    pagesMap.set(id, inserted.id);
  }

  const blocksMap = new Map<number, number>();
  for (const row of sourceBlocks) {
    const { id, pageId, layoutId, content, settings, ...rest } = row;
    const newPageId = pageId !== null ? (pagesMap.get(pageId) ?? null) : null;
    const newLayoutId = layoutId !== null ? (layoutsMap.get(layoutId) ?? null) : null;
    const newContent = remapFileReferences(content as JsonValue, filesMap);
    const newSettings =
      settings !== null && settings !== undefined
        ? remapFileReferences(settings as JsonValue, filesMap)
        : settings;
    const inserted = await ctx.db
      .insert(blocks)
      .values({
        ...rest,
        pageId: newPageId,
        layoutId: newLayoutId,
        content: newContent,
        settings: newSettings,
      })
      .returning()
      .get();
    blocksMap.set(id, inserted.id);
  }

  const itemsMap = new Map<number, number>();
  for (const row of topoSortItems(sourceItems)) {
    const { id, blockId, parentItemId, content, settings, ...rest } = row;
    const newBlockId = blocksMap.get(blockId);
    if (newBlockId === undefined) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: `Repeatable item ${id} references missing block ${blockId} during replication.`,
      });
    }
    const newParentItemId = parentItemId !== null ? (itemsMap.get(parentItemId) ?? null) : null;
    const newContent = remapFileReferences(content as JsonValue, filesMap);
    const newSettings =
      settings !== null && settings !== undefined
        ? remapFileReferences(settings as JsonValue, filesMap)
        : settings;
    const inserted = await ctx.db
      .insert(repeatableItems)
      .values({
        ...rest,
        blockId: newBlockId,
        parentItemId: newParentItemId,
        content: newContent,
        settings: newSettings,
      })
      .returning()
      .get();
    itemsMap.set(id, inserted.id);
  }

  // Phase 5 — broadcast invalidation -----------------------------------------
  // The project room is shared across envs; sessions on the source env will
  // refetch unchanged data (a no-op), and sessions on the target env will
  // pick up the new content.
  broadcastInvalidation({
    waitUntil: ctx.waitUntil,
    projectRoomNamespace: ctx.env.ProjectRoom,
    projectId,
    targets: [
      queryKeys.pages.list,
      queryKeys.pages.getByPathAll,
      queryKeys.files.list,
      queryKeys.layouts.all,
      queryKeys.blocks.getUsageCounts,
      queryKeys.environments.checkCompatibility,
    ],
  });

  return {
    source: { id: source.id, name: source.name },
    target: { id: target.id, name: target.name },
    copied: {
      layouts: sourceLayouts.length,
      blockDefinitions: sourceBlockDefs.length,
      files: sourceFiles.length,
      pages: sourcePages.length,
      blocks: sourceBlocks.length,
      repeatableItems: sourceItems.length,
    },
    snapshotKey,
  };
}
