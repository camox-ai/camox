import { queryKeys } from "@camox/api-contract/query-keys";
import { ORPCError } from "@orpc/server";
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { outdent } from "outdent";
import { z } from "zod";

import { assertBlockAccess, assertPageAccess } from "../../authorization";
import type { Database } from "../../db";
import { broadcastInvalidation } from "../../lib/broadcast-invalidation";
import { contentToMarkdown } from "../../lib/content-markdown";
import { resolveEnvironment } from "../../lib/resolve-environment";
import { scheduleAiJob } from "../../lib/schedule-ai-job";
import {
  blockDefinitions,
  blocks,
  files,
  layouts,
  member,
  pages,
  projects,
  repeatableItems,
} from "../../schema";
import type { ServiceContext } from "../_shared/service-context";
import { collectFileIds } from "../pages/ai";

// --- Input Schemas ---
// Exported so adapters (oRPC, MCP, CLI) share the same canonical contract.
// Services .parse() them on entry — service is the trust boundary.

const repeatableItemSeedSchema = z.object({
  tempId: z.string(),
  parentTempId: z.string().nullable(),
  fieldName: z.string(),
  content: z.unknown(),
  position: z.string(),
});

export const getBlockInput = z.object({ id: z.number() });
export const getPageMarkdownInput = z.object({ pageId: z.number() });
export const getBlocksUsageCountsInput = z.object({ projectId: z.number() });
export const createBlockInput = z.object({
  pageId: z.number(),
  type: z.string(),
  content: z.unknown(),
  settings: z.unknown().optional(),
  afterPosition: z.string().nullable().optional(),
  repeatableItems: z.array(repeatableItemSeedSchema).optional(),
});
export const updateBlockContentInput = z.object({ id: z.number(), content: z.unknown() });
export const updateBlockSettingsInput = z.object({ id: z.number(), settings: z.unknown() });
export const updateBlockPositionInput = z.object({
  id: z.number(),
  afterPosition: z.string().nullable().optional(),
  beforePosition: z.string().nullable().optional(),
});
export const deleteBlockInput = z.object({ id: z.number() });
export const deleteBlocksInput = z.object({ blockIds: z.array(z.number()) });
export const generateBlockSummaryInput = z.object({ id: z.number() });
export const duplicateBlockInput = z.object({ id: z.number() });

// --- Internal helpers ---

function assertUser(ctx: ServiceContext) {
  if (!ctx.user) throw new ORPCError("UNAUTHORIZED");
  return ctx.user;
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
      ? contentToMarkdown(contentSchema.toMarkdown, contentSchema.properties, content, {
          settings: block.settings as Record<string, unknown> | null | undefined,
        })
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

// --- Reads ---

export async function getBlock(ctx: ServiceContext, rawInput: z.input<typeof getBlockInput>) {
  const { id } = getBlockInput.parse(rawInput);
  const block = await ctx.db.select().from(blocks).where(eq(blocks.id, id)).get();
  if (!block) throw new ORPCError("NOT_FOUND");

  // Fetch repeatable items for this block
  const items = await ctx.db
    .select()
    .from(repeatableItems)
    .where(eq(repeatableItems.blockId, block.id));
  const sorted = items.sort((a, b) => comparePositions(a.position, b.position));

  // Build a map of parentItemId → grouped children by fieldName
  const childrenByParent = new Map<number | null, Map<string, typeof sorted>>();
  for (const item of sorted) {
    let fieldMap = childrenByParent.get(item.parentItemId);
    if (!fieldMap) {
      fieldMap = new Map();
      childrenByParent.set(item.parentItemId, fieldMap);
    }
    const list = fieldMap.get(item.fieldName) ?? [];
    list.push(item);
    fieldMap.set(item.fieldName, list);
  }

  // Add _itemId markers to block content for top-level items
  const content = { ...(block.content as Record<string, unknown>) };
  const topLevelFields = childrenByParent.get(null);
  if (topLevelFields) {
    for (const [fieldName, fieldItems] of topLevelFields) {
      content[fieldName] = fieldItems.map((i) => ({ _itemId: i.id }));
    }
  }

  // Add _itemId markers to each item's content for its nested children
  for (const item of sorted) {
    const nestedFields = childrenByParent.get(item.id);
    if (!nestedFields) continue;
    const itemContent = { ...(item.content as Record<string, unknown>) };
    for (const [fieldName, fieldItems] of nestedFields) {
      itemContent[fieldName] = fieldItems.map((i) => ({ _itemId: i.id }));
    }
    (item as any).content = itemContent;
  }

  // Collect and fetch referenced files
  const fileIds = new Set<number>();
  collectFileIds(content, fileIds);
  for (const item of sorted) {
    collectFileIds(item.content as Record<string, unknown>, fileIds);
  }

  const fileRows =
    fileIds.size > 0
      ? await ctx.db
          .select()
          .from(files)
          .where(inArray(files.id, [...fileIds]))
      : [];

  return {
    block: { ...block, content },
    repeatableItems: sorted,
    files: fileRows,
  };
}

export async function getPageMarkdown(
  ctx: ServiceContext,
  rawInput: z.input<typeof getPageMarkdownInput>,
) {
  const { pageId } = getPageMarkdownInput.parse(rawInput);

  const page = await ctx.db.select().from(pages).where(eq(pages.id, pageId)).get();
  if (!page) throw new ORPCError("NOT_FOUND");

  // Get block definitions for content schemas and toMarkdown templates
  const defs = await ctx.db
    .select()
    .from(blockDefinitions)
    .where(eq(blockDefinitions.projectId, page.projectId));
  const schemaByType = new Map<
    string,
    { title: string; properties: Record<string, any>; toMarkdown?: readonly string[] }
  >();
  for (const def of defs) {
    const schema = def.contentSchema as Record<string, unknown> | null;
    if (schema?.properties) {
      schemaByType.set(def.blockId, {
        title: def.title,
        properties: schema.properties as Record<string, any>,
        toMarkdown: schema.toMarkdown as readonly string[] | undefined,
      });
    }
  }

  // Get page blocks sorted by position
  const pageBlocks = await ctx.db.select().from(blocks).where(eq(blocks.pageId, pageId));
  const sorted = pageBlocks.sort((a, b) => comparePositions(a.position, b.position));

  // Fetch all repeatable items for these blocks
  const blockIds = sorted.map((b) => b.id);
  const allItems =
    blockIds.length > 0
      ? sortByPosition(
          await ctx.db
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
    const layoutBlocks = await ctx.db
      .select()
      .from(blocks)
      .where(eq(blocks.layoutId, page.layoutId));
    const sortedLayout = layoutBlocks.sort((a, b) => comparePositions(a.position, b.position));
    const layoutBlockIds = sortedLayout.map((b) => b.id);
    const layoutItems =
      layoutBlockIds.length > 0
        ? sortByPosition(
            await ctx.db
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
      const md = `<!-- ${schema.title} -->\n${contentToMarkdown(
        schema.toMarkdown,
        schema.properties,
        content,
        {
          settings: block.settings as Record<string, unknown> | null | undefined,
        },
      )}`;
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
    const md = contentToMarkdown(schema.toMarkdown, schema.properties, content, {
      settings: block.settings as Record<string, unknown> | null | undefined,
    });
    return `<!-- ${schema.title} -->\n${md}`;
  });

  const parts = [beforeMarkdown, ...pageParts, afterMarkdown].filter(Boolean);
  return { markdown: parts.join("\n\n") };
}

export async function getBlocksUsageCounts(
  ctx: ServiceContext,
  rawInput: z.input<typeof getBlocksUsageCountsInput>,
) {
  const { projectId } = getBlocksUsageCountsInput.parse(rawInput);
  const environment = await resolveEnvironment(ctx.db, projectId, ctx.environmentName);
  return await ctx.db
    .select({
      type: blocks.type,
      count: sql<number>`count(*)`,
    })
    .from(blocks)
    .leftJoin(pages, eq(blocks.pageId, pages.id))
    .leftJoin(layouts, eq(blocks.layoutId, layouts.id))
    .where(or(eq(pages.environmentId, environment.id), eq(layouts.environmentId, environment.id)))
    .groupBy(blocks.type);
}

// --- Writes ---

export async function createBlock(ctx: ServiceContext, rawInput: z.input<typeof createBlockInput>) {
  const user = assertUser(ctx);
  const {
    pageId,
    type,
    content,
    settings,
    afterPosition,
    repeatableItems: itemSeeds,
  } = createBlockInput.parse(rawInput);
  const access = await assertPageAccess(ctx.db, pageId, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  const now = Date.now();

  // Get all blocks for this page to determine correct position
  const pageBlocks = sortByPosition(
    await ctx.db.select().from(blocks).where(eq(blocks.pageId, pageId)),
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
    const afterIndex = findLastIndexLe(pageBlocks, afterPosition);
    const nextBlock = afterIndex >= 0 ? pageBlocks[afterIndex + 1] : pageBlocks[0];
    position = generateKeyBetween(
      afterIndex >= 0 ? pageBlocks[afterIndex].position : null,
      nextBlock?.position ?? null,
    );
  }
  const result = await ctx.db
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

  // Insert client-provided repeatable item seeds in topological order (parents before children)
  if (itemSeeds && itemSeeds.length > 0) {
    const tempIdToRealId = new Map<string, number>();

    for (const seed of itemSeeds) {
      const parentItemId = seed.parentTempId
        ? (tempIdToRealId.get(seed.parentTempId) ?? null)
        : null;
      const inserted = await ctx.db
        .insert(repeatableItems)
        .values({
          blockId: result.id,
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
      entityId: result.id,
      type: "summary",
      delayMs: 0,
    }),
  );
  broadcastInvalidation({
    waitUntil: ctx.waitUntil,
    projectRoomNamespace: ctx.env.ProjectRoom,
    projectId: access.page.projectId,
    targets: [
      queryKeys.pages.getByPath(access.page.fullPath),
      queryKeys.blocks.getPageMarkdown(pageId),
      queryKeys.blocks.getUsageCounts,
    ],
  });

  return result;
}

export async function updateBlockContent(
  ctx: ServiceContext,
  rawInput: z.input<typeof updateBlockContentInput>,
) {
  const user = assertUser(ctx);
  const { id, content } = updateBlockContentInput.parse(rawInput);
  const access = await assertBlockAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  // Merge partial content into existing content (frontend sends single-field patches)
  const merged = {
    ...(access.block.content as Record<string, unknown>),
    ...(content as Record<string, unknown>),
  };
  const result = await ctx.db
    .update(blocks)
    .set({ content: merged, updatedAt: Date.now() })
    .where(eq(blocks.id, id))
    .returning()
    .get();

  ctx.waitUntil(
    scheduleAiJob(ctx.env.AI_JOB_SCHEDULER, {
      entityTable: "blocks",
      entityId: id,
      type: "summary",
      delayMs: 5000,
    }),
  );
  // Granular invalidation: only refetch this block, not the entire page
  broadcastInvalidation({
    waitUntil: ctx.waitUntil,
    projectRoomNamespace: ctx.env.ProjectRoom,
    projectId: access.projectId,
    targets: [
      queryKeys.blocks.get(id),
      ...(access.block.pageId ? [queryKeys.blocks.getPageMarkdown(access.block.pageId)] : []),
    ],
  });

  return result;
}

export async function updateBlockSettings(
  ctx: ServiceContext,
  rawInput: z.input<typeof updateBlockSettingsInput>,
) {
  const user = assertUser(ctx);
  const { id, settings } = updateBlockSettingsInput.parse(rawInput);
  const access = await assertBlockAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  const merged = {
    ...(access.block.settings as Record<string, unknown> | null),
    ...(settings as Record<string, unknown>),
  };
  const result = await ctx.db
    .update(blocks)
    .set({ settings: merged, updatedAt: Date.now() })
    .where(eq(blocks.id, id))
    .returning()
    .get();
  // Granular invalidation: only refetch this block, not the entire page
  broadcastInvalidation({
    waitUntil: ctx.waitUntil,
    projectRoomNamespace: ctx.env.ProjectRoom,
    projectId: access.projectId,
    targets: [
      queryKeys.blocks.get(id),
      ...(access.block.pageId ? [queryKeys.blocks.getPageMarkdown(access.block.pageId)] : []),
    ],
  });
  return result;
}

export async function updateBlockPosition(
  ctx: ServiceContext,
  rawInput: z.input<typeof updateBlockPositionInput>,
) {
  const user = assertUser(ctx);
  const { id, afterPosition, beforePosition } = updateBlockPositionInput.parse(rawInput);
  const access = await assertBlockAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  // Query siblings (excluding the block being moved) to compute a correct position
  const block = access.block;
  const parentColumn = block.pageId ? blocks.pageId : blocks.layoutId;
  const parentId = block.pageId ?? block.layoutId;
  const siblings = parentId
    ? sortByPosition(
        (await ctx.db.select().from(blocks).where(eq(parentColumn, parentId))).filter(
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

  const result = await ctx.db
    .update(blocks)
    .set({ position, updatedAt: Date.now() })
    .where(eq(blocks.id, id))
    .returning()
    .get();
  broadcastInvalidation({
    waitUntil: ctx.waitUntil,
    projectRoomNamespace: ctx.env.ProjectRoom,
    projectId: access.projectId,
    targets: [
      ...(access.pagePath
        ? [queryKeys.pages.getByPath(access.pagePath)]
        : [queryKeys.pages.getByPathAll]),
      ...(access.block.pageId ? [queryKeys.blocks.getPageMarkdown(access.block.pageId)] : []),
      queryKeys.blocks.getUsageCounts,
    ],
  });
  return result;
}

export async function deleteBlock(ctx: ServiceContext, rawInput: z.input<typeof deleteBlockInput>) {
  const user = assertUser(ctx);
  const { id } = deleteBlockInput.parse(rawInput);
  const access = await assertBlockAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  const result = await ctx.db.delete(blocks).where(eq(blocks.id, id)).returning().get();
  broadcastInvalidation({
    waitUntil: ctx.waitUntil,
    projectRoomNamespace: ctx.env.ProjectRoom,
    projectId: access.projectId,
    targets: [
      ...(access.pagePath
        ? [queryKeys.pages.getByPath(access.pagePath)]
        : [queryKeys.pages.getByPathAll]),
      ...(access.block.pageId ? [queryKeys.blocks.getPageMarkdown(access.block.pageId)] : []),
      queryKeys.blocks.getUsageCounts,
    ],
  });
  return result;
}

export async function deleteBlocks(
  ctx: ServiceContext,
  rawInput: z.input<typeof deleteBlocksInput>,
) {
  const user = assertUser(ctx);
  const { blockIds } = deleteBlocksInput.parse(rawInput);
  if (blockIds.length === 0) return [];

  // Verify all blocks belong to an org the user is a member of
  const authorizedBlocks = await ctx.db
    .select({ id: blocks.id, projectId: projects.id })
    .from(blocks)
    .leftJoin(pages, eq(blocks.pageId, pages.id))
    .leftJoin(layouts, eq(blocks.layoutId, layouts.id))
    .innerJoin(projects, or(eq(projects.id, pages.projectId), eq(projects.id, layouts.projectId)))
    .innerJoin(
      member,
      and(eq(member.organizationId, projects.organizationId), eq(member.userId, user.id)),
    )
    .where(inArray(blocks.id, blockIds));
  if (authorizedBlocks.length !== blockIds.length) {
    throw new ORPCError("NOT_FOUND");
  }
  const result = await ctx.db.delete(blocks).where(inArray(blocks.id, blockIds)).returning();
  const projectId = authorizedBlocks[0]?.projectId;
  if (projectId) {
    broadcastInvalidation({
      waitUntil: ctx.waitUntil,
      projectRoomNamespace: ctx.env.ProjectRoom,
      projectId,
      targets: [queryKeys.pages.getByPathAll, queryKeys.blocks.getUsageCounts],
    });
  }
  return result;
}

export async function generateBlockSummary(
  ctx: ServiceContext,
  rawInput: z.input<typeof generateBlockSummaryInput>,
) {
  const user = assertUser(ctx);
  const { id } = generateBlockSummaryInput.parse(rawInput);
  const access = await assertBlockAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  const seoStale = await executeBlockSummary(ctx.db, ctx.env.OPEN_ROUTER_API_KEY, id);
  if (seoStale) {
    ctx.waitUntil(
      scheduleAiJob(ctx.env.AI_JOB_SCHEDULER, {
        entityTable: "pages",
        entityId: seoStale.pageId,
        type: "seo",
        delayMs: 15000,
      }),
    );
  }
  broadcastInvalidation({
    waitUntil: ctx.waitUntil,
    projectRoomNamespace: ctx.env.ProjectRoom,
    projectId: access.projectId,
    targets: [
      queryKeys.blocks.get(id),
      ...(access.pagePath
        ? [queryKeys.pages.getByPath(access.pagePath)]
        : [queryKeys.pages.getByPathAll]),
      ...(access.block.pageId ? [queryKeys.blocks.getPageMarkdown(access.block.pageId)] : []),
      queryKeys.blocks.getUsageCounts,
    ],
  });
  const updated = await ctx.db.select().from(blocks).where(eq(blocks.id, id)).get();
  return updated;
}

export async function duplicateBlock(
  ctx: ServiceContext,
  rawInput: z.input<typeof duplicateBlockInput>,
) {
  const user = assertUser(ctx);
  const { id } = duplicateBlockInput.parse(rawInput);
  const access = await assertBlockAccess(ctx.db, id, user.id);
  if (!access) throw new ORPCError("NOT_FOUND");
  const original = access.block;

  const now = Date.now();

  // Find the next block after the original to insert between them
  const parentId = original.pageId ?? original.layoutId;
  const parentColumn = original.pageId ? blocks.pageId : blocks.layoutId;
  const siblings = parentId
    ? sortByPosition(await ctx.db.select().from(blocks).where(eq(parentColumn, parentId)))
    : [];
  const originalIndex = siblings.findIndex((b) => b.id === id);
  const nextBlock = originalIndex >= 0 ? siblings[originalIndex + 1] : undefined;
  const position = generateKeyBetween(original.position, nextBlock?.position ?? null);

  const result = await ctx.db
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
  broadcastInvalidation({
    waitUntil: ctx.waitUntil,
    projectRoomNamespace: ctx.env.ProjectRoom,
    projectId: access.projectId,
    targets: [
      ...(access.pagePath
        ? [queryKeys.pages.getByPath(access.pagePath)]
        : [queryKeys.pages.getByPathAll]),
      ...(original.pageId ? [queryKeys.blocks.getPageMarkdown(original.pageId)] : []),
      queryKeys.blocks.getUsageCounts,
    ],
  });
  return result;
}
