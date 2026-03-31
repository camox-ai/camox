import { ORPCError } from "@orpc/server";
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { and, eq } from "drizzle-orm";
import { int, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { generateKeyBetween } from "fractional-indexing";
import { outdent } from "outdent";
import { z } from "zod";

import { assertBlockAccess, assertRepeatableItemAccess } from "../authorization";
import type { Database } from "../db";
import { broadcastInvalidation } from "../lib/broadcast-invalidation";
import { scheduleAiJob } from "../lib/schedule-ai-job";
import { authed } from "../orpc";
import { blocks } from "./blocks";

// --- Schema ---

export const repeatableItems = sqliteTable(
  "repeatable_items",
  {
    id: int().primaryKey({ autoIncrement: true }),
    blockId: int("block_id")
      .notNull()
      .references(() => blocks.id),
    fieldName: text("field_name").notNull(),
    content: text({ mode: "json" }).notNull(),
    summary: text().notNull().default(""),
    position: text().notNull(),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    index("repeatable_items_block_field_idx").on(table.blockId, table.fieldName),
    index("repeatable_items_block_idx").on(table.blockId),
  ],
);

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
  fieldName: z.string(),
  content: z.unknown(),
  afterPosition: z.string().nullable().optional(),
});

const create = authed.input(createItemSchema).handler(async ({ context, input }) => {
  const { blockId, fieldName, content, afterPosition } = input;
  const access = await assertBlockAccess(context.db, blockId, context.orgSlug);
  if (!access) throw new ORPCError("NOT_FOUND");

  const now = Date.now();

  // Get siblings to determine correct position
  const siblings = (
    await context.db
      .select()
      .from(repeatableItems)
      .where(and(eq(repeatableItems.blockId, blockId), eq(repeatableItems.fieldName, fieldName)))
  ).sort((a, b) => a.position.localeCompare(b.position));

  let position: string;
  if (afterPosition === undefined || afterPosition === null) {
    const lastItem = siblings[siblings.length - 1];
    position = generateKeyBetween(lastItem?.position ?? null, null);
  } else if (afterPosition === "") {
    const firstItem = siblings[0];
    position = generateKeyBetween(null, firstItem?.position ?? null);
  } else {
    const afterIndex = siblings.findIndex((s) => s.position === afterPosition);
    const nextItem = siblings[afterIndex + 1];
    position = generateKeyBetween(afterPosition, nextItem?.position ?? null);
  }

  const result = await context.db
    .insert(repeatableItems)
    .values({
      blockId,
      fieldName,
      content,
      summary: "",
      position,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  scheduleAiJob(context.env.AI_JOB_SCHEDULER, {
    entityTable: "repeatableItems",
    entityId: result.id,
    type: "summary",
    delayMs: 0,
  });
  broadcastInvalidation(context.env.ProjectRoom, access.projectId, {
    entity: "repeatableItem",
    action: "created",
    entityId: result.id,
    parentId: blockId,
    pagePath: access.pagePath ?? undefined,
  });

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
    broadcastInvalidation(context.env.ProjectRoom, access.projectId, {
      entity: "repeatableItem",
      action: "updated",
      entityId: id,
      parentId: access.item.blockId,
      pagePath: access.pagePath ?? undefined,
    });

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

    const position = generateKeyBetween(afterPosition ?? null, beforePosition ?? null);
    const result = await context.db
      .update(repeatableItems)
      .set({ position, updatedAt: Date.now() })
      .where(eq(repeatableItems.id, id))
      .returning()
      .get();
    broadcastInvalidation(context.env.ProjectRoom, access.projectId, {
      entity: "repeatableItem",
      action: "updated",
      entityId: id,
      parentId: access.item.blockId,
      pagePath: access.pagePath ?? undefined,
    });
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
  ).sort((a, b) => a.position.localeCompare(b.position));
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
  broadcastInvalidation(context.env.ProjectRoom, access.projectId, {
    entity: "repeatableItem",
    action: "created",
    entityId: result.id,
    parentId: original.blockId,
    pagePath: access.pagePath ?? undefined,
  });
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
    broadcastInvalidation(context.env.ProjectRoom, access.projectId, {
      entity: "repeatableItem",
      action: "updated",
      entityId: id,
      parentId: access.item.blockId,
      pagePath: access.pagePath ?? undefined,
    });
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

  const result = await context.db
    .delete(repeatableItems)
    .where(eq(repeatableItems.id, id))
    .returning()
    .get();
  broadcastInvalidation(context.env.ProjectRoom, access.projectId, {
    entity: "repeatableItem",
    action: "deleted",
    entityId: id,
    parentId: access.item.blockId,
    pagePath: access.pagePath ?? undefined,
  });
  return result;
});

export const repeatableItemProcedures = {
  create,
  updateContent,
  updatePosition,
  duplicate,
  generateSummary,
  delete: deleteFn,
};
