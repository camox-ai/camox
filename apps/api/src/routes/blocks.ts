import { ORPCError } from "@orpc/server";
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { and, eq, or, sql, inArray } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { outdent } from "outdent";
import { z } from "zod";

import { assertBlockAccess, assertPageAccess } from "../authorization";
import type { Database } from "../db";
import { broadcastInvalidation } from "../lib/broadcast-invalidation";
import { contentToMarkdown } from "../lib/content-markdown";
import { queryKeys } from "../lib/query-keys";
import { scheduleAiJob } from "../lib/schedule-ai-job";
import { pub, authed } from "../orpc";
import {
  blockDefinitions,
  blocks,
  files,
  layouts,
  pages,
  projects,
  repeatableItems,
} from "../schema";
import { collectFileIds } from "./pages";

// --- AI Executor ---

async function generateObjectSummary(
  apiKey: string,
  options: { type: string; markdown: string; previousSummary?: string },
) {
  const stabilityBlock = options.previousSummary
    ? outdent`

      <previous_summary>${options.previousSummary}</previous_summary>
      <stability_instruction>
        A summary was previously generated for this content.
        Return the SAME summary unless it is no longer accurate.
        Only change it if the content has meaningfully changed.
      </stability_instruction>
    `
    : "";

  return await chat({
    adapter: createOpenRouterText("openai/gpt-oss-20b", apiKey),
    stream: false,
    messages: [
      {
        role: "user",
        content: outdent`
            <instruction>
              Generate a concise summary for a piece of website content.
            </instruction>

            <constraints>
              - MAXIMUM 4 WORDS
              - Capture the main idea or purpose
              - Be descriptive and specific to the content type
              - Use sentence case (only capitalize the first word and proper nouns)
              - Don't use markdown, just plain text
              - Don't use punctuation
              - Use abbreviations or acronyms where appropriate
            </constraints>

            <context>
              <type>${options.type}</type>
              <content>${options.markdown}</content>
            </context>
            ${stabilityBlock}

            <examples>
              <example>
                <type>paragraph</type>
                <content>{"text": "This is a description of how our service works in detail."}</content>
                <output>Service explanation details</output>
              </example>

              <example>
                <type>button</type>
                <content>{"text": "Submit Form", "action": "submit"}</content>
                <output>Submit form button</output>
              </example>
            </examples>

            <format>
              Return only the summary text, nothing else.
            </format>
          `,
      },
    ],
  });
}

/** Recursively nest child items into their parent item's content. */
function nestChildItems(
  allItems: { id: number; parentItemId: number | null; fieldName: string; content: unknown }[],
) {
  const childrenByParent = new Map<number, Map<string, typeof allItems>>();
  for (const item of allItems) {
    if (item.parentItemId === null) continue;
    let fieldMap = childrenByParent.get(item.parentItemId);
    if (!fieldMap) {
      fieldMap = new Map();
      childrenByParent.set(item.parentItemId, fieldMap);
    }
    const list = fieldMap.get(item.fieldName) ?? [];
    list.push(item);
    fieldMap.set(item.fieldName, list);
  }
  for (const item of allItems) {
    const childFields = childrenByParent.get(item.id);
    if (!childFields) continue;
    const content = item.content as Record<string, unknown>;
    for (const [fieldName, children] of childFields) {
      content[fieldName] = children;
    }
  }
}

function comparePositions(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sortByPosition<T extends { position: string }>(items: T[]): T[] {
  return items.sort((a, b) => comparePositions(a.position, b.position));
}

/** Find the last index where item.position <= target in a sorted array. */
function findLastIndexLe<T extends { position: string }>(items: T[], target: string): number {
  let result = -1;
  for (let i = 0; i < items.length; i++) {
    if (items[i].position <= target) result = i;
    else break;
  }
  return result;
}

async function assembleBlockContent(db: Database, blockId: number) {
  const block = await db.select().from(blocks).where(eq(blocks.id, blockId)).get();
  if (!block) return null;

  // Get block definition for content schema and field order
  let projectId: number | null = null;
  if (block.pageId) {
    const page = await db.select().from(pages).where(eq(pages.id, block.pageId)).get();
    projectId = page?.projectId ?? null;
  } else if (block.layoutId) {
    const layout = await db.select().from(layouts).where(eq(layouts.id, block.layoutId)).get();
    projectId = layout?.projectId ?? null;
  }

  const def = projectId
    ? await db
        .select()
        .from(blockDefinitions)
        .where(
          and(eq(blockDefinitions.projectId, projectId), eq(blockDefinitions.blockId, block.type)),
        )
        .get()
    : null;

  const contentSchema = (def?.contentSchema as Record<string, any>) ?? null;
  const fieldOrder = contentSchema?.properties
    ? Object.keys(contentSchema.properties as Record<string, unknown>)
    : undefined;

  // Merge repeatable items into content
  const items = sortByPosition(
    await db.select().from(repeatableItems).where(eq(repeatableItems.blockId, blockId)),
  );

  nestChildItems(items);

  const content = { ...(block.content as Record<string, unknown>) };
  const topLevelFieldNames = new Set(
    items.filter((item) => item.parentItemId === null).map((item) => item.fieldName),
  );
  for (const fieldName of topLevelFieldNames) {
    content[fieldName] = items.filter((i) => i.fieldName === fieldName && i.parentItemId === null);
  }

  // Reorder keys to match field order from block definition
  if (fieldOrder) {
    const ordered: Record<string, unknown> = {};
    for (const key of fieldOrder) {
      if (key in content) ordered[key] = content[key];
    }
    for (const key of Object.keys(content)) {
      if (!(key in ordered)) ordered[key] = content[key];
    }
    return { block, content: ordered, contentSchema };
  }

  return { block, content, contentSchema };
}

/**
 * Generates and stores a summary for a block.
 * Returns `{ pageId }` if the parent page has AI SEO enabled (caller should cascade).
 */
export async function executeBlockSummary(
  db: Database,
  apiKey: string,
  blockId: number,
): Promise<{ pageId: number } | null> {
  const assembled = await assembleBlockContent(db, blockId);
  if (!assembled) return null;

  const { block, content, contentSchema } = assembled;

  const markdown =
    contentSchema?.toMarkdown && contentSchema?.properties
      ? contentToMarkdown(contentSchema.toMarkdown, contentSchema.properties, content)
      : JSON.stringify(content);

  const summary = await generateObjectSummary(apiKey, {
    type: block.type,
    markdown,
    previousSummary: block.summary,
  });

  await db.update(blocks).set({ summary, updatedAt: Date.now() }).where(eq(blocks.id, blockId));

  // Check if we should cascade to page SEO
  if (summary !== block.summary && block.pageId) {
    const page = await db.select().from(pages).where(eq(pages.id, block.pageId)).get();
    if (page?.aiSeoEnabled !== false) {
      return { pageId: block.pageId };
    }
  }

  return null;
}

// --- Procedures ---

const createBlockSchema = z.object({
  pageId: z.number(),
  type: z.string(),
  content: z.unknown(),
  settings: z.unknown().optional(),
  afterPosition: z.string().nullable().optional(),
});

const getPageMarkdown = pub
  .input(z.object({ pageId: z.number() }))
  .handler(async ({ context, input }) => {
    const { pageId } = input;

    const page = await context.db.select().from(pages).where(eq(pages.id, pageId)).get();
    if (!page) throw new ORPCError("NOT_FOUND");

    // Get block definitions for content schemas and toMarkdown templates
    const defs = await context.db
      .select()
      .from(blockDefinitions)
      .where(eq(blockDefinitions.projectId, page.projectId));
    const schemaByType = new Map<
      string,
      { properties: Record<string, any>; toMarkdown?: readonly string[] }
    >();
    for (const def of defs) {
      const schema = def.contentSchema as Record<string, unknown> | null;
      if (schema?.properties) {
        schemaByType.set(def.blockId, {
          properties: schema.properties as Record<string, any>,
          toMarkdown: schema.toMarkdown as readonly string[] | undefined,
        });
      }
    }

    // Get page blocks sorted by position
    const pageBlocks = await context.db.select().from(blocks).where(eq(blocks.pageId, pageId));
    const sorted = pageBlocks.sort((a, b) => comparePositions(a.position, b.position));

    // Fetch all repeatable items for these blocks
    const blockIds = sorted.map((b) => b.id);
    const allItems =
      blockIds.length > 0
        ? sortByPosition(
            await context.db
              .select()
              .from(repeatableItems)
              .where(inArray(repeatableItems.blockId, blockIds)),
          )
        : [];
    nestChildItems(allItems);
    const itemsByBlock = new Map<number, typeof allItems>();
    for (const item of allItems) {
      if (item.parentItemId !== null) continue;
      const list = itemsByBlock.get(item.blockId) ?? [];
      list.push(item);
      itemsByBlock.set(item.blockId, list);
    }

    // Also fetch layout blocks if page has a layout
    let beforeMarkdown = "";
    let afterMarkdown = "";
    if (page.layoutId) {
      const layoutBlocks = await context.db
        .select()
        .from(blocks)
        .where(eq(blocks.layoutId, page.layoutId));
      const sortedLayout = layoutBlocks.sort((a, b) => comparePositions(a.position, b.position));
      const layoutBlockIds = sortedLayout.map((b) => b.id);
      const layoutItems =
        layoutBlockIds.length > 0
          ? sortByPosition(
              await context.db
                .select()
                .from(repeatableItems)
                .where(inArray(repeatableItems.blockId, layoutBlockIds)),
            )
          : [];
      nestChildItems(layoutItems);
      const layoutItemsByBlock = new Map<number, typeof layoutItems>();
      for (const item of layoutItems) {
        if (item.parentItemId !== null) continue;
        const list = layoutItemsByBlock.get(item.blockId) ?? [];
        list.push(item);
        layoutItemsByBlock.set(item.blockId, list);
      }

      const beforeParts: string[] = [];
      const afterParts: string[] = [];
      for (const block of sortedLayout) {
        const schema = schemaByType.get(block.type);
        if (!schema?.toMarkdown) continue;
        const content = { ...(block.content as Record<string, unknown>) };
        const items = layoutItemsByBlock.get(block.id) ?? [];
        for (const fieldName of new Set(items.map((i) => i.fieldName))) {
          content[fieldName] = items.filter((i) => i.fieldName === fieldName);
        }
        const md = contentToMarkdown(schema.toMarkdown, schema.properties, content);
        if (block.placement === "before") beforeParts.push(md);
        else afterParts.push(md);
      }
      beforeMarkdown = beforeParts.join("\n\n");
      afterMarkdown = afterParts.join("\n\n");
    }

    // Convert page blocks to markdown
    const pageParts = sorted.map((block) => {
      const schema = schemaByType.get(block.type);
      if (!schema?.toMarkdown) return JSON.stringify(block.content);
      const content = { ...(block.content as Record<string, unknown>) };
      const items = itemsByBlock.get(block.id) ?? [];
      for (const fieldName of new Set(items.map((i) => i.fieldName))) {
        content[fieldName] = items.filter((i) => i.fieldName === fieldName);
      }
      return contentToMarkdown(schema.toMarkdown, schema.properties, content);
    });

    const parts = [beforeMarkdown, ...pageParts, afterMarkdown].filter(Boolean);
    return { markdown: parts.join("\n\n") };
  });

const getUsageCounts = pub.handler(async ({ context }) => {
  const result = await context.db
    .select({
      type: blocks.type,
      count: sql<number>`count(*)`,
    })
    .from(blocks)
    .groupBy(blocks.type);
  return result;
});

const create = authed.input(createBlockSchema).handler(async ({ context, input }) => {
  const orgSlug = context.orgSlug;
  const { pageId, type, content, settings, afterPosition } = input;
  const access = await assertPageAccess(context.db, pageId, orgSlug);
  if (!access) throw new ORPCError("NOT_FOUND");

  const now = Date.now();

  // Get all blocks for this page to determine correct position
  const pageBlocks = sortByPosition(
    await context.db.select().from(blocks).where(eq(blocks.pageId, pageId)),
  );

  let position: string;
  if (afterPosition == null) {
    // No afterPosition provided → insert at the end
    const lastBlock = pageBlocks[pageBlocks.length - 1];
    position = generateKeyBetween(lastBlock?.position ?? null, null);
  } else if (afterPosition === "") {
    // Empty string marker → insert at the beginning
    const firstBlock = pageBlocks[0];
    position = generateKeyBetween(null, firstBlock?.position ?? null);
  } else {
    // Insert after the specified position
    const afterIndex = findLastIndexLe(pageBlocks, afterPosition!);
    const nextBlock = afterIndex >= 0 ? pageBlocks[afterIndex + 1] : pageBlocks[0];
    position = generateKeyBetween(
      afterIndex >= 0 ? pageBlocks[afterIndex].position : null,
      nextBlock?.position ?? null,
    );
  }
  const result = await context.db
    .insert(blocks)
    .values({
      pageId,
      type,
      content,
      settings: settings ?? null,
      position,
      summary: "",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  scheduleAiJob(context.env.AI_JOB_SCHEDULER, {
    entityTable: "blocks",
    entityId: result.id,
    type: "summary",
    delayMs: 0,
  });
  broadcastInvalidation(context.env.ProjectRoom, access.page.projectId, [
    queryKeys.pages.getByPath(access.page.fullPath),
    queryKeys.blocks.getPageMarkdown(pageId),
    queryKeys.blocks.getUsageCounts,
  ]);

  return result;
});

const updateContent = authed
  .input(z.object({ id: z.number(), content: z.unknown() }))
  .handler(async ({ context, input }) => {
    const orgSlug = context.orgSlug;
    const { id, content } = input;
    const access = await assertBlockAccess(context.db, id, orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    // Merge partial content into existing content (frontend sends single-field patches)
    const merged = {
      ...(access.block.content as Record<string, unknown>),
      ...(content as Record<string, unknown>),
    };
    const result = await context.db
      .update(blocks)
      .set({ content: merged, updatedAt: Date.now() })
      .where(eq(blocks.id, id))
      .returning()
      .get();

    scheduleAiJob(context.env.AI_JOB_SCHEDULER, {
      entityTable: "blocks",
      entityId: id,
      type: "summary",
      delayMs: 5000,
    });
    // Granular invalidation: only refetch this block, not the entire page
    broadcastInvalidation(context.env.ProjectRoom, access.projectId, [
      queryKeys.blocks.get(id),
      ...(access.block.pageId ? [queryKeys.blocks.getPageMarkdown(access.block.pageId)] : []),
    ]);

    return result;
  });

const updateSettings = authed
  .input(z.object({ id: z.number(), settings: z.unknown() }))
  .handler(async ({ context, input }) => {
    const orgSlug = context.orgSlug;
    const { id, settings } = input;
    const access = await assertBlockAccess(context.db, id, orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    const result = await context.db
      .update(blocks)
      .set({ settings, updatedAt: Date.now() })
      .where(eq(blocks.id, id))
      .returning()
      .get();
    // Granular invalidation: only refetch this block, not the entire page
    broadcastInvalidation(context.env.ProjectRoom, access.projectId, [
      queryKeys.blocks.get(id),
      ...(access.block.pageId ? [queryKeys.blocks.getPageMarkdown(access.block.pageId)] : []),
    ]);
    return result;
  });

const updatePosition = authed
  .input(
    z.object({
      id: z.number(),
      afterPosition: z.string().nullable().optional(),
      beforePosition: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const orgSlug = context.orgSlug;
    const { id, afterPosition, beforePosition } = input;
    const access = await assertBlockAccess(context.db, id, orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    // Query siblings (excluding the block being moved) to compute a correct position
    const block = access.block;
    const parentColumn = block.pageId ? blocks.pageId : blocks.layoutId;
    const parentId = block.pageId ?? block.layoutId;
    const siblings = parentId
      ? sortByPosition(
          (await context.db.select().from(blocks).where(eq(parentColumn, parentId))).filter(
            (b) => b.id !== id,
          ),
        )
      : [];

    const after = afterPosition || null;
    const before = beforePosition || null;

    let position: string;
    if (!after && !before) {
      const last = siblings[siblings.length - 1];
      position = generateKeyBetween(last?.position ?? null, null);
    } else if (!after) {
      const firstIdx = siblings.findIndex((b) => b.position >= before!);
      position = generateKeyBetween(null, siblings[firstIdx]?.position ?? null);
    } else {
      const afterIdx = findLastIndexLe(siblings, after);
      const nextPos = siblings[afterIdx + 1]?.position ?? null;
      position = generateKeyBetween(siblings[afterIdx]?.position ?? null, nextPos);
    }

    const result = await context.db
      .update(blocks)
      .set({ position, updatedAt: Date.now() })
      .where(eq(blocks.id, id))
      .returning()
      .get();
    broadcastInvalidation(context.env.ProjectRoom, access.projectId, [
      ...(access.pagePath
        ? [queryKeys.pages.getByPath(access.pagePath)]
        : [queryKeys.pages.getByPathAll]),
      ...(access.block.pageId ? [queryKeys.blocks.getPageMarkdown(access.block.pageId)] : []),
      queryKeys.blocks.getUsageCounts,
    ]);
    return result;
  });

const deleteFn = authed.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const orgSlug = context.orgSlug;
  const { id } = input;
  const access = await assertBlockAccess(context.db, id, orgSlug);
  if (!access) throw new ORPCError("NOT_FOUND");

  const result = await context.db.delete(blocks).where(eq(blocks.id, id)).returning().get();
  broadcastInvalidation(context.env.ProjectRoom, access.projectId, [
    ...(access.pagePath
      ? [queryKeys.pages.getByPath(access.pagePath)]
      : [queryKeys.pages.getByPathAll]),
    ...(access.block.pageId ? [queryKeys.blocks.getPageMarkdown(access.block.pageId)] : []),
    queryKeys.blocks.getUsageCounts,
  ]);
  return result;
});

const deleteMany = authed
  .input(z.object({ blockIds: z.array(z.number()) }))
  .handler(async ({ context, input }) => {
    const orgSlug = context.orgSlug;
    const { blockIds } = input;
    if (blockIds.length === 0) return [];

    // Verify all blocks belong to the user's org
    const authorizedBlocks = await context.db
      .select({ id: blocks.id, projectId: projects.id })
      .from(blocks)
      .leftJoin(pages, eq(blocks.pageId, pages.id))
      .leftJoin(layouts, eq(blocks.layoutId, layouts.id))
      .innerJoin(projects, or(eq(projects.id, pages.projectId), eq(projects.id, layouts.projectId)))
      .where(and(inArray(blocks.id, blockIds), eq(projects.organizationSlug, orgSlug)));
    if (authorizedBlocks.length !== blockIds.length) {
      throw new ORPCError("NOT_FOUND");
    }
    const result = await context.db.delete(blocks).where(inArray(blocks.id, blockIds)).returning();
    const projectId = authorizedBlocks[0]?.projectId;
    if (projectId) {
      broadcastInvalidation(context.env.ProjectRoom, projectId, [
        queryKeys.pages.getByPathAll,
        queryKeys.blocks.getUsageCounts,
      ]);
    }
    return result;
  });

const generateSummary = authed
  .input(z.object({ id: z.number() }))
  .handler(async ({ context, input }) => {
    const orgSlug = context.orgSlug;
    const { id } = input;
    const access = await assertBlockAccess(context.db, id, orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    const seoStale = await executeBlockSummary(context.db, context.env.OPEN_ROUTER_API_KEY, id);
    if (seoStale) {
      scheduleAiJob(context.env.AI_JOB_SCHEDULER, {
        entityTable: "pages",
        entityId: seoStale.pageId,
        type: "seo",
        delayMs: 15000,
      });
    }
    broadcastInvalidation(context.env.ProjectRoom, access.projectId, [
      queryKeys.blocks.get(id),
      ...(access.pagePath
        ? [queryKeys.pages.getByPath(access.pagePath)]
        : [queryKeys.pages.getByPathAll]),
      ...(access.block.pageId ? [queryKeys.blocks.getPageMarkdown(access.block.pageId)] : []),
      queryKeys.blocks.getUsageCounts,
    ]);
    const updated = await context.db.select().from(blocks).where(eq(blocks.id, id)).get();
    return updated;
  });

const duplicate = authed.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const orgSlug = context.orgSlug;
  const { id } = input;
  const access = await assertBlockAccess(context.db, id, orgSlug);
  if (!access) throw new ORPCError("NOT_FOUND");
  const original = access.block;

  const now = Date.now();

  // Find the next block after the original to insert between them
  const parentId = original.pageId ?? original.layoutId;
  const parentColumn = original.pageId ? blocks.pageId : blocks.layoutId;
  const siblings = parentId
    ? sortByPosition(await context.db.select().from(blocks).where(eq(parentColumn, parentId)))
    : [];
  const originalIndex = siblings.findIndex((b) => b.id === id);
  const nextBlock = originalIndex >= 0 ? siblings[originalIndex + 1] : undefined;
  const position = generateKeyBetween(original.position, nextBlock?.position ?? null);

  const result = await context.db
    .insert(blocks)
    .values({
      pageId: original.pageId,
      layoutId: original.layoutId,
      type: original.type,
      content: original.content,
      settings: original.settings,
      placement: original.placement,
      summary: original.summary,
      position,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  broadcastInvalidation(context.env.ProjectRoom, access.projectId, [
    ...(access.pagePath
      ? [queryKeys.pages.getByPath(access.pagePath)]
      : [queryKeys.pages.getByPathAll]),
    ...(original.pageId ? [queryKeys.blocks.getPageMarkdown(original.pageId)] : []),
    queryKeys.blocks.getUsageCounts,
  ]);
  return result;
});

const get = pub.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const block = await context.db.select().from(blocks).where(eq(blocks.id, input.id)).get();
  if (!block) throw new ORPCError("NOT_FOUND");

  // Fetch repeatable items for this block
  const items = await context.db
    .select()
    .from(repeatableItems)
    .where(eq(repeatableItems.blockId, block.id));
  const sorted = items.sort((a, b) => comparePositions(a.position, b.position));

  // Add _itemId markers to block content
  const content = { ...(block.content as Record<string, unknown>) };
  const topLevelByField = new Map<string, typeof sorted>();
  for (const item of sorted) {
    if (item.parentItemId !== null) continue;
    const list = topLevelByField.get(item.fieldName) ?? [];
    list.push(item);
    topLevelByField.set(item.fieldName, list);
  }
  for (const [fieldName, fieldItems] of topLevelByField) {
    content[fieldName] = fieldItems.map((i) => ({ _itemId: i.id }));
  }

  // Collect and fetch referenced files
  const fileIds = new Set<number>();
  collectFileIds(content, fileIds);
  for (const item of sorted) {
    collectFileIds(item.content as Record<string, unknown>, fileIds);
  }

  const fileRows =
    fileIds.size > 0
      ? await context.db
          .select()
          .from(files)
          .where(inArray(files.id, [...fileIds]))
      : [];

  return {
    block: { ...block, content },
    repeatableItems: sorted,
    files: fileRows,
  };
});

export const blockProcedures = {
  get,
  getPageMarkdown,
  getUsageCounts,
  create,
  updateContent,
  updateSettings,
  updatePosition,
  delete: deleteFn,
  deleteMany,
  generateSummary,
  duplicate,
};
