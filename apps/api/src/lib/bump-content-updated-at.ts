import { eq, inArray } from "drizzle-orm";

import type { Database } from "../db";
import { blocks, layouts, pages } from "../schema";

/**
 * Bumps `content_updated_at` on the parent page or layout that owns these
 * blocks. Called by every block / repeatable-item mutation so the derived
 * publish status is a cheap timestamp compare instead of a row scan. One
 * extra UPDATE per mutation on the hot edit path.
 */
export async function bumpContentUpdatedAt(
  db: Database,
  parent: { pageId?: number | null; layoutId?: number | null },
) {
  const now = Date.now();
  if (parent.pageId != null) {
    await db.update(pages).set({ contentUpdatedAt: now }).where(eq(pages.id, parent.pageId));
    return;
  }
  if (parent.layoutId != null) {
    await db.update(layouts).set({ contentUpdatedAt: now }).where(eq(layouts.id, parent.layoutId));
  }
}

/** Looks up a single block's parent and bumps it. */
export async function bumpContentUpdatedAtForBlock(db: Database, blockId: number) {
  const row = await db
    .select({ pageId: blocks.pageId, layoutId: blocks.layoutId })
    .from(blocks)
    .where(eq(blocks.id, blockId))
    .get();
  if (!row) return;
  await bumpContentUpdatedAt(db, row);
}

/** Variant for batch mutations — looks up parents for several block ids. */
export async function bumpContentUpdatedAtForBlocks(db: Database, blockIds: number[]) {
  if (blockIds.length === 0) return;
  const rows = await db
    .select({ pageId: blocks.pageId, layoutId: blocks.layoutId })
    .from(blocks)
    .where(inArray(blocks.id, blockIds));
  const pageIds = new Set<number>();
  const layoutIds = new Set<number>();
  for (const row of rows) {
    if (row.pageId != null) pageIds.add(row.pageId);
    else if (row.layoutId != null) layoutIds.add(row.layoutId);
  }
  const now = Date.now();
  if (pageIds.size > 0) {
    await db
      .update(pages)
      .set({ contentUpdatedAt: now })
      .where(inArray(pages.id, [...pageIds]));
  }
  if (layoutIds.size > 0) {
    await db
      .update(layouts)
      .set({ contentUpdatedAt: now })
      .where(inArray(layouts.id, [...layoutIds]));
  }
}
