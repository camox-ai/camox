import { ORPCError } from "@orpc/server";
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { and, eq, inArray } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { outdent } from "outdent";
import { z } from "zod";

import { assertBlockAccess, assertRepeatableItemAccess } from "../authorization";
import type { Database } from "../db";
import { broadcastInvalidation } from "../lib/broadcast-invalidation";
import { queryKeys } from "../lib/query-keys";
import { scheduleAiJob } from "../lib/schedule-ai-job";
import { pub, authed } from "../orpc";
import { blockDefinitions, blocks, files, repeatableItems } from "../schema";
import { createDefaultRepeatableItems } from "./blocks";
import { collectFileIds } from "./pages";

function comparePositions(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
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

/**
 * Generates and stores a summary for a repeatable item.
 * Returns `{ blockId }` so the caller can cascade to block summary regeneration.
 */
export async function executeRepeatableItemSummary(
  db: Database,
  apiKey: string,
  itemId: number,
): Promise<{ blockId: number } | null> {
  const item = await db.select().from(repeatableItems).where(eq(repeatableItems.id, itemId)).get();
  if (!item) return null;

  const block = await db.select().from(blocks).where(eq(blocks.id, item.blockId)).get();
  if (!block) return null;

  const summary = await generateObjectSummary(apiKey, {
    type: block.type,
    markdown: JSON.stringify(item.content),
    previousSummary: item.summary,
  });

  await db
    .update(repeatableItems)
    .set({ summary, updatedAt: Date.now() })
    .where(eq(repeatableItems.id, itemId));

  if (summary !== item.summary) {
    return { blockId: item.blockId };
  }

  return null;
}

// --- Procedures ---

const createItemSchema = z.object({
  blockId: z.number(),
  parentItemId: z.number().nullable().optional(),
  fieldName: z.string(),
  content: z.unknown(),
  afterPosition: z.string().nullable().optional(),
});

const create = authed.input(createItemSchema).handler(async ({ context, input }) => {
  const { blockId, parentItemId, fieldName, content, afterPosition } = input;
  const access = await assertBlockAccess(context.db, blockId, context.orgSlug);
  if (!access) throw new ORPCError("NOT_FOUND");

  const now = Date.now();

  // Get siblings to determine correct position
  const siblings = (
    await context.db
      .select()
      .from(repeatableItems)
      .where(and(eq(repeatableItems.blockId, blockId), eq(repeatableItems.fieldName, fieldName)))
  ).sort((a, b) => comparePositions(a.position, b.position));

  let position: string;
  if (afterPosition === undefined || afterPosition === null) {
    const lastItem = siblings[siblings.length - 1];
    position = generateKeyBetween(lastItem?.position ?? null, null);
  } else if (afterPosition === "") {
    const firstItem = siblings[0];
    position = generateKeyBetween(null, firstItem?.position ?? null);
  } else {
    const afterIndex = findLastIndexLe(siblings, afterPosition!);
    const nextItem = afterIndex >= 0 ? siblings[afterIndex + 1] : siblings[0];
    position = generateKeyBetween(
      afterIndex >= 0 ? siblings[afterIndex].position : null,
      nextItem?.position ?? null,
    );
  }

  const result = await context.db
    .insert(repeatableItems)
    .values({
      blockId,
      parentItemId: parentItemId ?? null,
      fieldName,
      content,
      summary: "",
      position,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // Create default nested repeatable items if the item's schema has nested repeatable fields
  const def = await context.db
    .select()
    .from(blockDefinitions)
    .where(
      and(
        eq(blockDefinitions.projectId, access.projectId),
        eq(blockDefinitions.blockId, access.block.type),
      ),
    )
    .get();

  if (def?.contentSchema) {
    // Walk the parent chain to find the schema path for this item's field.
    // Each ancestor item contributes: ancestor.fieldName → .items.properties
    const ancestors: string[] = [];
    let currentParentId = parentItemId ?? null;
    while (currentParentId !== null) {
      const parent = await context.db
        .select()
        .from(repeatableItems)
        .where(eq(repeatableItems.id, currentParentId))
        .get();
      if (!parent) break;
      ancestors.unshift(parent.fieldName);
      currentParentId = parent.parentItemId;
    }

    // Navigate the schema: root → ancestors[0].items.properties → ... → fieldName.items.properties
    let schema: Record<string, any> | undefined = (def.contentSchema as any)?.properties;
    for (const ancestorField of ancestors) {
      schema = schema?.[ancestorField]?.items?.properties;
    }
    const itemProperties = schema?.[fieldName]?.items?.properties as
      | Record<string, any>
      | undefined;
    if (itemProperties) {
      await createDefaultRepeatableItems(context.db, blockId, result.id, itemProperties, now);
    }
  }

  scheduleAiJob(context.env.AI_JOB_SCHEDULER, {
    entityTable: "repeatableItems",
    entityId: result.id,
    type: "summary",
    delayMs: 0,
  });
  // Granular invalidation: refetch the parent block bundle (includes new item)
  broadcastInvalidation(context.env.ProjectRoom, access.projectId, [
    queryKeys.blocks.get(blockId),
    queryKeys.blocks.getUsageCounts,
  ]);

  return result;
});

const updateContent = authed
  .input(z.object({ id: z.number(), content: z.unknown() }))
  .handler(async ({ context, input }) => {
    const { id, content } = input;
    const access = await assertRepeatableItemAccess(context.db, id, context.orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    // Merge partial content into existing content (frontend sends single-field patches)
    const merged = {
      ...(access.item.content as Record<string, unknown>),
      ...(content as Record<string, unknown>),
    };
    const result = await context.db
      .update(repeatableItems)
      .set({ content: merged, updatedAt: Date.now() })
      .where(eq(repeatableItems.id, id))
      .returning()
      .get();

    scheduleAiJob(context.env.AI_JOB_SCHEDULER, {
      entityTable: "repeatableItems",
      entityId: id,
      type: "summary",
      delayMs: 5000,
    });
    // Granular invalidation: only refetch the parent block bundle
    broadcastInvalidation(context.env.ProjectRoom, access.projectId, [
      queryKeys.blocks.get(access.item.blockId),
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
    const { id, afterPosition, beforePosition } = input;
    const access = await assertRepeatableItemAccess(context.db, id, context.orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    const item = access.item;
    const siblings = (
      await context.db
        .select()
        .from(repeatableItems)
        .where(
          and(
            eq(repeatableItems.blockId, item.blockId),
            eq(repeatableItems.fieldName, item.fieldName),
          ),
        )
    )
      .filter((s) => s.id !== id)
      .sort((a, b) => comparePositions(a.position, b.position));

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
      .update(repeatableItems)
      .set({ position, updatedAt: Date.now() })
      .where(eq(repeatableItems.id, id))
      .returning()
      .get();
    // Granular invalidation: only refetch the parent block bundle
    broadcastInvalidation(context.env.ProjectRoom, access.projectId, [
      queryKeys.blocks.get(access.item.blockId),
    ]);
    return result;
  });

const duplicate = authed.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const { id } = input;
  const access = await assertRepeatableItemAccess(context.db, id, context.orgSlug);
  if (!access) throw new ORPCError("NOT_FOUND");
  const original = access.item;

  const now = Date.now();

  // Find the next sibling to insert between original and next
  const siblings = (
    await context.db
      .select()
      .from(repeatableItems)
      .where(
        and(
          eq(repeatableItems.blockId, original.blockId),
          eq(repeatableItems.fieldName, original.fieldName),
        ),
      )
  ).sort((a, b) => comparePositions(a.position, b.position));
  const originalIndex = siblings.findIndex((s) => s.id === id);
  const nextItem = originalIndex >= 0 ? siblings[originalIndex + 1] : undefined;
  const position = generateKeyBetween(original.position, nextItem?.position ?? null);

  const result = await context.db
    .insert(repeatableItems)
    .values({
      blockId: original.blockId,
      fieldName: original.fieldName,
      content: original.content,
      summary: original.summary,
      position,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  // Granular invalidation: refetch the parent block bundle (includes new item)
  broadcastInvalidation(context.env.ProjectRoom, access.projectId, [
    queryKeys.blocks.get(original.blockId),
    queryKeys.blocks.getUsageCounts,
  ]);
  return result;
});

const generateSummary = authed
  .input(z.object({ id: z.number() }))
  .handler(async ({ context, input }) => {
    const { id } = input;
    const access = await assertRepeatableItemAccess(context.db, id, context.orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    const cascade = await executeRepeatableItemSummary(
      context.db,
      context.env.OPEN_ROUTER_API_KEY,
      id,
    );
    if (cascade) {
      scheduleAiJob(context.env.AI_JOB_SCHEDULER, {
        entityTable: "blocks",
        entityId: cascade.blockId,
        type: "summary",
        delayMs: 5000,
      });
    }
    // Granular invalidation: refetch the parent block bundle (includes updated summary)
    broadcastInvalidation(context.env.ProjectRoom, access.projectId, [
      queryKeys.blocks.get(access.item.blockId),
      queryKeys.blocks.getUsageCounts,
    ]);
    const updated = await context.db
      .select()
      .from(repeatableItems)
      .where(eq(repeatableItems.id, id))
      .get();
    return updated;
  });

const deleteFn = authed.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const { id } = input;
  const access = await assertRepeatableItemAccess(context.db, id, context.orgSlug);
  if (!access) throw new ORPCError("NOT_FOUND");

  const blockId = access.item.blockId;
  const result = await context.db
    .delete(repeatableItems)
    .where(eq(repeatableItems.id, id))
    .returning()
    .get();
  // Granular invalidation: refetch the parent block bundle (item removed)
  broadcastInvalidation(context.env.ProjectRoom, access.projectId, [
    queryKeys.blocks.get(blockId),
    queryKeys.blocks.getUsageCounts,
  ]);
  return result;
});

const get = pub.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const item = await context.db
    .select()
    .from(repeatableItems)
    .where(eq(repeatableItems.id, input.id))
    .get();
  if (!item) throw new ORPCError("NOT_FOUND");

  // Collect and fetch referenced files
  const fileIds = new Set<number>();
  collectFileIds(item.content as Record<string, unknown>, fileIds);

  const fileRows =
    fileIds.size > 0
      ? await context.db
          .select()
          .from(files)
          .where(inArray(files.id, [...fileIds]))
      : [];

  return {
    item,
    files: fileRows,
  };
});

export const repeatableItemProcedures = {
  get,
  create,
  updateContent,
  updatePosition,
  duplicate,
  generateSummary,
  delete: deleteFn,
};
