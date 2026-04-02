import { ORPCError } from "@orpc/server";
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { eq, inArray } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { outdent } from "outdent";
import { z } from "zod";

import { assertPageAccess, getAuthorizedProject } from "../authorization";
import type { Database } from "../db";
import { broadcastInvalidation } from "../lib/broadcast-invalidation";
import { contentToMarkdown } from "../lib/content-markdown";
import { markdownToLexicalState, plainTextToLexicalState } from "../lib/lexical-state";
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

// --- AI Executors ---

const SEO_STRIP_KEYS = new Set([
  "createdAt",
  "updatedAt",
  "position",
  "settings",
  "pageId",
  "blockId",
  "fieldName",
  "summary",
  "_fileId",
]);

function stripNonSeoFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SEO_STRIP_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? stripNonSeoFields(item as Record<string, unknown>)
          : item,
      );
    } else if (value && typeof value === "object") {
      result[key] = stripNonSeoFields(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function generatePageSeoFromAi(
  apiKey: string,
  options: {
    fullPath: string;
    blocks: { type: string; markdown: string }[];
    previousMetaTitle?: string | null;
    previousMetaDescription?: string | null;
  },
) {
  const stabilityBlock =
    options.previousMetaTitle || options.previousMetaDescription
      ? outdent`

      <previous_metadata>
        <metaTitle>${options.previousMetaTitle ?? ""}</metaTitle>
        <metaDescription>${options.previousMetaDescription ?? ""}</metaDescription>
      </previous_metadata>
      <stability_instruction>
        Metadata was previously generated for this page.
        Return the SAME metadata unless it is no longer accurate.
        Only change it if the page content has meaningfully changed.
      </stability_instruction>
    `
      : "";

  return await chat({
    adapter: createOpenRouterText("google/gemini-3-flash-preview", apiKey),
    outputSchema: z.object({
      metaTitle: z.string(),
      metaDescription: z.string(),
    }),
    messages: [
      {
        role: "user",
        content: outdent`
          <instruction>
            Generate SEO metadata for a web page.
          </instruction>

          <constraints>
            - metaTitle: under 60 characters, concise and descriptive. Use sentence case (only capitalize the first word and proper nouns). Do NOT include the site/brand name — it will be appended automatically. Do NOT use separators like "-", "|", or ":" to split the title into parts.
            - metaDescription: under 160 characters, compelling summary of the page
            - Be specific to the actual content, not generic
            - Don't use markdown, just plain text
          </constraints>

          <page>
            <path>${options.fullPath}</path>
            <blocks>${JSON.stringify(options.blocks)}</blocks>
          </page>
          ${stabilityBlock}
        `,
      },
    ],
  });
}

async function generatePageDraftFromAi(
  apiKey: string,
  options: {
    contentDescription: string;
    blockDefs: {
      blockId: string;
      title: string;
      description: string;
      contentSchema: unknown;
      settingsSchema?: unknown;
    }[];
  },
) {
  const blockDefsForPrompt = options.blockDefs.map((def) => ({
    blockId: def.blockId,
    title: def.title,
    description: def.description,
    contentSchema: def.contentSchema,
    ...(def.settingsSchema ? { settingsSchema: def.settingsSchema } : {}),
  }));

  const text = await chat({
    adapter: createOpenRouterText("google/gemini-3-flash-preview", apiKey),
    stream: false,
    messages: [
      {
        role: "user",
        content: outdent`
          <instruction>
            Generate a page layout with blocks based on the user's description.
          </instruction>

          <available_blocks>
            ${JSON.stringify(blockDefsForPrompt)}
          </available_blocks>

          <page_description>
            ${options.contentDescription}
          </page_description>

          <output_format>
            Return a JSON array of blocks. Each block must have:
            - "type": the blockId from available_blocks
            - "content": an object matching the contentSchema for that block type
            - "settings" (optional): an object matching the settingsSchema for that block type, if it has one

            Only use blocks from available_blocks. Ensure content matches schema constraints (maxLength, etc.).
            For RepeatableObject fields (arrays), provide an array of objects matching the nested schema.
            For settings, pick values from the enum options or boolean values defined in the settingsSchema.
            For String fields, you may use markdown formatting: **bold** and *italic*.

            IMPORTANT: Return ONLY the raw JSON array. Do NOT wrap it in markdown code fences or any other formatting. The response must be valid JSON that can be parsed directly.
          </output_format>
        `,
      },
    ],
  });

  return JSON.parse(text) as {
    type: string;
    content: Record<string, unknown>;
    settings?: Record<string, unknown>;
  }[];
}

export async function executePageSeo(db: Database, apiKey: string, pageId: number) {
  const page = await db.select().from(pages).where(eq(pages.id, pageId)).get();
  if (!page || page.aiSeoEnabled === false) return;

  // Get all blocks for this page
  const pageBlocks = await db.select().from(blocks).where(eq(blocks.pageId, pageId));
  const sorted = pageBlocks.sort((a, b) => comparePositions(a.position, b.position));

  // Get block definitions for content schemas
  const defs = await db
    .select()
    .from(blockDefinitions)
    .where(eq(blockDefinitions.projectId, page.projectId));
  const contentSchemaByType = new Map<string, any>();
  const fieldOrderByType = new Map<string, string[]>();
  for (const def of defs) {
    const schema = def.contentSchema as Record<string, unknown> | null;
    if (schema?.properties) {
      contentSchemaByType.set(def.blockId, schema);
      fieldOrderByType.set(def.blockId, Object.keys(schema.properties as Record<string, unknown>));
    }
  }

  // Assemble content for each block (merge repeatable items)
  const blockIds = sorted.map((b) => b.id);
  const allItems =
    blockIds.length > 0
      ? sortByPosition(
          await db.select().from(repeatableItems).where(inArray(repeatableItems.blockId, blockIds)),
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

  const markdownBlocks = sorted.map((block) => {
    const content = { ...(block.content as Record<string, unknown>) };
    const items = itemsByBlock.get(block.id) ?? [];
    const fieldNames = new Set(items.map((i) => i.fieldName));
    for (const fieldName of fieldNames) {
      content[fieldName] = items.filter((i) => i.fieldName === fieldName);
    }

    const stripped = stripNonSeoFields(content);
    const schema = contentSchemaByType.get(block.type);

    return {
      type: block.type,
      markdown:
        schema?.toMarkdown && schema?.properties
          ? contentToMarkdown(schema.toMarkdown, schema.properties, stripped)
          : JSON.stringify(stripped),
    };
  });

  const seo = await generatePageSeoFromAi(apiKey, {
    fullPath: page.fullPath,
    blocks: markdownBlocks,
    previousMetaTitle: page.metaTitle,
    previousMetaDescription: page.metaDescription,
  });

  await db
    .update(pages)
    .set({
      metaTitle: seo.metaTitle,
      metaDescription: seo.metaDescription,
      updatedAt: Date.now(),
    })
    .where(eq(pages.id, pageId));
}

// --- Content Assembly Helpers ---

function comparePositions(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sortByPosition<T extends { position: string }>(items: T[]): T[] {
  return items.sort((a, b) => comparePositions(a.position, b.position));
}

export function collectFileIds(content: Record<string, unknown>, fileIds: Set<number>) {
  for (const value of Object.values(content)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      if ("_fileId" in obj && obj._fileId != null) {
        fileIds.add(Number(obj._fileId));
      } else {
        collectFileIds(obj, fileIds);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && "content" in item) {
          collectFileIds((item as { content: Record<string, unknown> }).content, fileIds);
        } else if (item && typeof item === "object" && !Array.isArray(item)) {
          collectFileIds(item as Record<string, unknown>, fileIds);
        }
      }
    }
  }
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

async function buildFileMap(db: Database, fileIds: Set<number>) {
  if (fileIds.size === 0) return new Map();
  const rows = await db
    .select()
    .from(files)
    .where(inArray(files.id, [...fileIds]));
  return new Map(rows.map((f) => [f.id, f]));
}

// --- Procedures ---

const updatePageSchema = z.object({
  pathSegment: z.string(),
  parentPageId: z.number().nullable().optional(),
});

const DEFAULT_HERO_BLOCK = {
  type: "hero",
  content: {
    title: plainTextToLexicalState("A page title"),
    description: plainTextToLexicalState("An engaging block description"),
    cta: { type: "external", text: "Get started", href: "/", newTab: false },
  },
};

const createPageSchema = z.object({
  projectId: z.number(),
  pathSegment: z.string(),
  parentPageId: z.number().optional(),
  layoutId: z.number(),
  contentDescription: z.string().optional(),
});

// Public procedures

const getByPath = pub.input(z.object({ path: z.string() })).handler(async ({ context, input }) => {
  const { path: fullPath } = input;
  const db = context.db;

  const page = await db.select().from(pages).where(eq(pages.fullPath, fullPath)).get();
  if (!page) throw new ORPCError("NOT_FOUND");

  const project = await db.select().from(projects).where(eq(projects.id, page.projectId)).get();
  if (!project) throw new ORPCError("NOT_FOUND");

  // Fetch page blocks sorted by position
  const pageBlocks = sortByPosition(
    await db.select().from(blocks).where(eq(blocks.pageId, page.id)),
  );

  // Fetch layout and its blocks
  const layout = page.layoutId
    ? await db.select().from(layouts).where(eq(layouts.id, page.layoutId)).get()
    : null;

  const layoutBlocks = layout
    ? sortByPosition(await db.select().from(blocks).where(eq(blocks.layoutId, layout.id)))
    : [];

  // Merge all blocks into a single array
  const allBlocks = [...pageBlocks, ...layoutBlocks];
  const allBlockIds = allBlocks.map((b) => b.id);

  // Fetch all repeatable items for all blocks (top-level + nested)
  const allItems =
    allBlockIds.length > 0
      ? sortByPosition(
          await db
            .select()
            .from(repeatableItems)
            .where(inArray(repeatableItems.blockId, allBlockIds)),
        )
      : [];

  // Group top-level items by block:fieldName for _itemId markers
  const topLevelItemsByBlockField = new Map<string, typeof allItems>();
  for (const item of allItems) {
    if (item.parentItemId !== null) continue;
    const key = `${item.blockId}:${item.fieldName}`;
    const list = topLevelItemsByBlockField.get(key) ?? [];
    list.push(item);
    topLevelItemsByBlockField.set(key, list);
  }

  // Add _itemId markers to block content for repeatable fields
  const blocksWithMarkers = allBlocks.map((block) => {
    const content = { ...(block.content as Record<string, unknown>) };
    for (const [key, items] of topLevelItemsByBlockField) {
      if (!key.startsWith(`${block.id}:`)) continue;
      const fieldName = key.slice(String(block.id).length + 1);
      content[fieldName] = items.map((item) => ({ _itemId: item.id }));
    }
    return { ...block, content };
  });

  // Collect file IDs from all block content and repeatable item content
  const fileIds = new Set<number>();
  for (const block of blocksWithMarkers) {
    collectFileIds(block.content as Record<string, unknown>, fileIds);
  }
  for (const item of allItems) {
    collectFileIds(item.content as Record<string, unknown>, fileIds);
  }

  // Fetch referenced files
  const fileRows = await buildFileMap(db, fileIds);

  // Build ID arrays
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
});

/**
 * Lightweight version of getByPath — returns only structural data (page, layout,
 * project name, block ID arrays). No blocks, items, or files.
 * Used by the frontend for client-side refetches after structural mutations.
 */
const getStructure = pub
  .input(z.object({ path: z.string() }))
  .handler(async ({ context, input }) => {
    const { path: fullPath } = input;
    const db = context.db;

    const page = await db.select().from(pages).where(eq(pages.fullPath, fullPath)).get();
    if (!page) throw new ORPCError("NOT_FOUND");

    const project = await db.select().from(projects).where(eq(projects.id, page.projectId)).get();
    if (!project) throw new ORPCError("NOT_FOUND");

    // Only fetch block IDs and positions (no content, items, or files)
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
  });

const list = pub.handler(async ({ context }) => {
  return await context.db.select().from(pages);
});

const get = pub.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const { id } = input;
  const result = await context.db.select().from(pages).where(eq(pages.id, id)).get();
  if (!result) throw new ORPCError("NOT_FOUND");
  return result;
});

// Protected procedures

const create = authed.input(createPageSchema).handler(async ({ context, input }) => {
  const orgSlug = context.orgSlug;
  const { projectId, pathSegment, parentPageId, layoutId, contentDescription } = input;
  const project = await getAuthorizedProject(context.db, projectId, orgSlug);
  if (!project) throw new ORPCError("NOT_FOUND");

  let generatedBlocks: {
    type: string;
    content: Record<string, unknown>;
    settings?: Record<string, unknown>;
  }[] = [DEFAULT_HERO_BLOCK];

  if (contentDescription) {
    try {
      const allDefs = await context.db
        .select()
        .from(blockDefinitions)
        .where(eq(blockDefinitions.projectId, projectId));
      const defs = allDefs.filter((d) => !d.layoutOnly);

      if (defs.length > 0) {
        generatedBlocks = await generatePageDraftFromAi(context.env.OPEN_ROUTER_API_KEY, {
          contentDescription,
          blockDefs: defs.map((d) => ({
            blockId: d.blockId,
            title: d.title,
            description: d.description ?? "",
            contentSchema: d.contentSchema,
            settingsSchema: d.settingsSchema ?? undefined,
          })),
        });

        // Convert markdown string fields to Lexical JSON
        const defsByType = new Map(defs.map((d) => [d.blockId, d]));
        for (const block of generatedBlocks) {
          const def = defsByType.get(block.type);
          const props = (def?.contentSchema as any)?.properties;
          if (!props) continue;
          for (const [key, schemaProp] of Object.entries(props)) {
            if (
              (schemaProp as any)?.fieldType === "String" &&
              typeof block.content[key] === "string"
            ) {
              block.content[key] = markdownToLexicalState(block.content[key] as string);
            }
          }
        }
      }
    } catch (error) {
      console.error("AI generation failed, using default block:", error);
      generatedBlocks = [DEFAULT_HERO_BLOCK];
    }
  }

  // Compute full path
  let fullPath = `/${pathSegment}`;
  if (parentPageId) {
    const parent = await context.db.select().from(pages).where(eq(pages.id, parentPageId)).get();
    if (parent) {
      fullPath = `${parent.fullPath}/${pathSegment}`;
    }
  }

  const now = Date.now();
  const page = await context.db
    .insert(pages)
    .values({
      projectId,
      pathSegment,
      fullPath,
      parentPageId: parentPageId ?? null,
      layoutId,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // Create blocks
  let prevPosition: string | null = null;
  for (const genBlock of generatedBlocks) {
    const position = generateKeyBetween(prevPosition, null);
    prevPosition = position;

    // Separate scalar content from array fields (repeatable items)
    const scalarContent: Record<string, unknown> = {};
    const arrayFields: Record<string, unknown[]> = {};
    for (const [key, value] of Object.entries(genBlock.content)) {
      if (Array.isArray(value)) {
        arrayFields[key] = value;
      } else {
        scalarContent[key] = value;
      }
    }

    const block = await context.db
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

    // Create repeatable items for array fields
    for (const [fieldName, items] of Object.entries(arrayFields)) {
      let itemPrevPos: string | null = null;
      for (const itemContent of items) {
        const itemPos = generateKeyBetween(itemPrevPos, null);
        itemPrevPos = itemPos;
        await context.db.insert(repeatableItems).values({
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

    scheduleAiJob(context.env.AI_JOB_SCHEDULER, {
      entityTable: "blocks",
      entityId: block.id,
      type: "summary",
      delayMs: 0,
    });
  }

  broadcastInvalidation(context.env.ProjectRoom, projectId, [
    queryKeys.pages.list,
    queryKeys.pages.getById(page.id),
  ]);

  return { page, fullPath: page.fullPath };
});

const update = authed
  .input(updatePageSchema.extend({ id: z.number() }))
  .handler(async ({ context, input }) => {
    const orgSlug = context.orgSlug;
    const { id, ...body } = input;
    const access = await assertPageAccess(context.db, id, orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    const result = await context.db
      .update(pages)
      .set({ ...body, updatedAt: Date.now() })
      .where(eq(pages.id, id))
      .returning()
      .get();
    broadcastInvalidation(context.env.ProjectRoom, access.page.projectId, [
      queryKeys.pages.list,
      queryKeys.pages.getById(id),
    ]);
    return result;
  });

const deleteFn = authed.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const orgSlug = context.orgSlug;
  const { id } = input;
  const access = await assertPageAccess(context.db, id, orgSlug);
  if (!access) throw new ORPCError("NOT_FOUND");

  const result = await context.db.delete(pages).where(eq(pages.id, id)).returning().get();
  broadcastInvalidation(context.env.ProjectRoom, access.page.projectId, [
    queryKeys.pages.list,
    queryKeys.pages.getById(id),
  ]);
  return result;
});

const setAiSeo = authed
  .input(z.object({ id: z.number(), enabled: z.boolean() }))
  .handler(async ({ context, input }) => {
    const orgSlug = context.orgSlug;
    const { id, enabled } = input;
    const access = await assertPageAccess(context.db, id, orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    const result = await context.db
      .update(pages)
      .set({ aiSeoEnabled: enabled, updatedAt: Date.now() })
      .where(eq(pages.id, id))
      .returning()
      .get();
    if (enabled) {
      scheduleAiJob(context.env.AI_JOB_SCHEDULER, {
        entityTable: "pages",
        entityId: id,
        type: "seo",
        delayMs: 0,
      });
    }
    broadcastInvalidation(context.env.ProjectRoom, access.page.projectId, [
      queryKeys.pages.list,
      queryKeys.pages.getById(id),
    ]);
    return result;
  });

const setMetaTitle = authed
  .input(z.object({ id: z.number(), metaTitle: z.string() }))
  .handler(async ({ context, input }) => {
    const orgSlug = context.orgSlug;
    const { id, metaTitle } = input;
    const access = await assertPageAccess(context.db, id, orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    const result = await context.db
      .update(pages)
      .set({ metaTitle, updatedAt: Date.now() })
      .where(eq(pages.id, id))
      .returning()
      .get();
    broadcastInvalidation(context.env.ProjectRoom, access.page.projectId, [
      queryKeys.pages.list,
      queryKeys.pages.getById(id),
    ]);
    return result;
  });

const setMetaDescription = authed
  .input(z.object({ id: z.number(), metaDescription: z.string() }))
  .handler(async ({ context, input }) => {
    const orgSlug = context.orgSlug;
    const { id, metaDescription } = input;
    const access = await assertPageAccess(context.db, id, orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    const result = await context.db
      .update(pages)
      .set({ metaDescription, updatedAt: Date.now() })
      .where(eq(pages.id, id))
      .returning()
      .get();
    broadcastInvalidation(context.env.ProjectRoom, access.page.projectId, [
      queryKeys.pages.list,
      queryKeys.pages.getById(id),
    ]);
    return result;
  });

const setLayout = authed
  .input(z.object({ id: z.number(), layoutId: z.number() }))
  .handler(async ({ context, input }) => {
    const orgSlug = context.orgSlug;
    const { id, layoutId } = input;
    const access = await assertPageAccess(context.db, id, orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    const result = await context.db
      .update(pages)
      .set({ layoutId, updatedAt: Date.now() })
      .where(eq(pages.id, id))
      .returning()
      .get();
    broadcastInvalidation(context.env.ProjectRoom, access.page.projectId, [
      queryKeys.pages.list,
      queryKeys.pages.getById(id),
    ]);
    return result;
  });

const generateSeo = authed
  .input(z.object({ id: z.number() }))
  .handler(async ({ context, input }) => {
    const orgSlug = context.orgSlug;
    const { id } = input;
    const access = await assertPageAccess(context.db, id, orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    await executePageSeo(context.db, context.env.OPEN_ROUTER_API_KEY, id);
    broadcastInvalidation(context.env.ProjectRoom, access.page.projectId, [
      queryKeys.pages.list,
      queryKeys.pages.getById(id),
    ]);
    const updated = await context.db.select().from(pages).where(eq(pages.id, id)).get();
    return updated;
  });

export const pageProcedures = {
  getByPath,
  getStructure,
  list,
  get,
  create,
  update,
  delete: deleteFn,
  setAiSeo,
  setMetaTitle,
  setMetaDescription,
  setLayout,
  generateSeo,
};
