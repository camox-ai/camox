import { rewriteAssetSchema } from "@camox/ai-tools";
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { eq, inArray } from "drizzle-orm";
import { outdent } from "outdent";
import { z } from "zod";

import type { Database } from "../../db";
import { contentToMarkdown } from "../../lib/content-markdown";
import { blockDefinitions, blocks, files, pages, repeatableItems } from "../../schema";

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

export async function generatePageDraftFromAi(
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
    contentSchema: rewriteAssetSchema(def.contentSchema),
    ...(def.settingsSchema ? { settingsSchema: rewriteAssetSchema(def.settingsSchema) } : {}),
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
            For RepeatableItems fields (arrays), provide an array of objects matching the nested schema.
            For settings, pick values from the enum options or boolean values defined in the settingsSchema.
            For String fields, you may use markdown formatting: **bold** and *italic*.
            For Image/File fields, return either { "_fileId": <integer> } matching an existing file id or null — never invent URLs.

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

  const pageBlocks = await db.select().from(blocks).where(eq(blocks.pageId, pageId));
  const sorted = pageBlocks.sort((a, b) => comparePositions(a.position, b.position));

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
          ? contentToMarkdown(schema.toMarkdown, schema.properties, stripped, {
              settings: block.settings as Record<string, unknown> | null | undefined,
            })
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

export function comparePositions(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function sortByPosition<T extends { position: string }>(items: T[]): T[] {
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
export function nestChildItems(
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

export async function buildFileMap(db: Database, fileIds: Set<number>) {
  if (fileIds.size === 0) return new Map();
  const rows = await db
    .select()
    .from(files)
    .where(inArray(files.id, [...fileIds]));
  return new Map(rows.map((f) => [f.id, f]));
}
