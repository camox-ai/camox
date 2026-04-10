import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";

import type { Database } from "../db";
import {
  blockDefinitions,
  blocks,
  environments,
  files,
  layouts,
  pages,
  repeatableItems,
} from "../schema";

export async function resolveEnvironment(
  db: Database,
  projectId: number,
  environmentName: string,
  options?: { autoCreate?: boolean },
) {
  let environment = await db
    .select()
    .from(environments)
    .where(and(eq(environments.projectId, projectId), eq(environments.name, environmentName)))
    .get();

  let created = false;

  if (!environment && options?.autoCreate) {
    const now = Date.now();
    environment = await db
      .insert(environments)
      .values({
        projectId,
        name: environmentName,
        type: "development",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    await forkProductionContent(db, projectId, environment.id);
    created = true;
  }

  if (!environment) {
    throw new ORPCError("NOT_FOUND", {
      message: `Environment "${environmentName}" not found`,
    });
  }
  return { ...environment, created };
}

// ---------------------------------------------------------------------------
// Fork production content into a new environment
// ---------------------------------------------------------------------------

function remapFileIds(content: unknown, fileIdMap: Map<number, number>): unknown {
  if (content === null || content === undefined) return content;
  if (Array.isArray(content)) {
    return content.map((item) => remapFileIds(item, fileIdMap));
  }
  if (typeof content === "object") {
    const obj = content as Record<string, unknown>;
    if ("_fileId" in obj && typeof obj._fileId === "number") {
      const newId = fileIdMap.get(obj._fileId);
      if (newId !== undefined) {
        return { ...obj, _fileId: newId };
      }
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = remapFileIds(value, fileIdMap);
    }
    return result;
  }
  return content;
}

async function forkProductionContent(db: Database, projectId: number, newEnvironmentId: number) {
  const prodEnv = await db
    .select()
    .from(environments)
    .where(and(eq(environments.projectId, projectId), eq(environments.type, "production")))
    .get();
  if (!prodEnv) return;

  const now = Date.now();

  // 1. Block definitions
  const prodDefs = await db
    .select()
    .from(blockDefinitions)
    .where(eq(blockDefinitions.environmentId, prodEnv.id));
  for (const def of prodDefs) {
    const { id: _, ...rest } = def;
    await db
      .insert(blockDefinitions)
      .values({ ...rest, environmentId: newEnvironmentId, createdAt: now, updatedAt: now });
  }

  // 2. Files (same blob/URL, new environment) — build ID mapping
  const fileIdMap = new Map<number, number>();
  const prodFiles = await db.select().from(files).where(eq(files.environmentId, prodEnv.id));
  for (const file of prodFiles) {
    const { id: _, ...rest } = file;
    const newFile = await db
      .insert(files)
      .values({ ...rest, environmentId: newEnvironmentId, createdAt: now, updatedAt: now })
      .returning()
      .get();
    fileIdMap.set(file.id, newFile.id);
  }

  // 3. Layouts — build ID mapping
  const layoutIdMap = new Map<number, number>();
  const prodLayouts = await db.select().from(layouts).where(eq(layouts.environmentId, prodEnv.id));
  for (const layout of prodLayouts) {
    const { id: _, ...rest } = layout;
    const newLayout = await db
      .insert(layouts)
      .values({ ...rest, environmentId: newEnvironmentId, createdAt: now, updatedAt: now })
      .returning()
      .get();
    layoutIdMap.set(layout.id, newLayout.id);
  }

  // 4. Layout blocks + their repeatable items
  const blockIdMap = new Map<number, number>();
  for (const [oldLayoutId, newLayoutId] of layoutIdMap) {
    const layoutBlocks = await db.select().from(blocks).where(eq(blocks.layoutId, oldLayoutId));
    for (const block of layoutBlocks) {
      const { id: _, ...rest } = block;
      const newBlock = await db
        .insert(blocks)
        .values({
          ...rest,
          layoutId: newLayoutId,
          content: remapFileIds(rest.content, fileIdMap),
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      blockIdMap.set(block.id, newBlock.id);
    }
  }

  // 5. Pages — sort by id so parents are inserted before children
  const pageIdMap = new Map<number, number>();
  const prodPages = await db.select().from(pages).where(eq(pages.environmentId, prodEnv.id));
  prodPages.sort((a, b) => a.id - b.id);

  for (const page of prodPages) {
    const { id: _, ...rest } = page;
    const newPage = await db
      .insert(pages)
      .values({
        ...rest,
        environmentId: newEnvironmentId,
        layoutId: layoutIdMap.get(page.layoutId) ?? page.layoutId,
        parentPageId: page.parentPageId ? (pageIdMap.get(page.parentPageId) ?? null) : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    pageIdMap.set(page.id, newPage.id);
  }

  // 6. Page blocks
  for (const [oldPageId, newPageId] of pageIdMap) {
    const pageBlocks = await db.select().from(blocks).where(eq(blocks.pageId, oldPageId));
    for (const block of pageBlocks) {
      const { id: _, ...rest } = block;
      const newBlock = await db
        .insert(blocks)
        .values({
          ...rest,
          pageId: newPageId,
          content: remapFileIds(rest.content, fileIdMap),
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      blockIdMap.set(block.id, newBlock.id);
    }
  }

  // 7. Repeatable items for all copied blocks — sort by id so parents come first
  for (const [oldBlockId, newBlockId] of blockIdMap) {
    const items = await db
      .select()
      .from(repeatableItems)
      .where(eq(repeatableItems.blockId, oldBlockId));
    items.sort((a, b) => a.id - b.id);

    const itemIdMap = new Map<number, number>();
    for (const item of items) {
      const { id: _, ...rest } = item;
      const newItem = await db
        .insert(repeatableItems)
        .values({
          ...rest,
          blockId: newBlockId,
          parentItemId: item.parentItemId ? (itemIdMap.get(item.parentItemId) ?? null) : null,
          content: remapFileIds(rest.content, fileIdMap),
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      itemIdMap.set(item.id, newItem.id);
    }
  }
}
