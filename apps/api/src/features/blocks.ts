import { zValidator } from "@hono/zod-validator";
import { eq, sql, inArray } from "drizzle-orm";
import { int, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { generateKeyBetween } from "fractional-indexing";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../types";
import { layouts } from "./layouts";
import { pages } from "./pages";

// --- Schema ---

export const blocks = sqliteTable(
  "blocks",
  {
    id: int().primaryKey({ autoIncrement: true }),
    pageId: int("page_id").references(() => pages.id),
    layoutId: int("layout_id").references(() => layouts.id),
    type: text().notNull(),
    content: text({ mode: "json" }).notNull(),
    settings: text({ mode: "json" }),
    placement: text().$type<"before" | "after">(),
    summary: text().notNull().default(""),
    position: text().notNull(),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    index("blocks_page_idx").on(table.pageId),
    index("blocks_layout_idx").on(table.layoutId),
    index("blocks_type_idx").on(table.type),
  ],
);

// --- Routes ---

const createBlockSchema = z.object({
  pageId: z.number(),
  type: z.string(),
  content: z.unknown(),
  settings: z.unknown().optional(),
  afterPosition: z.string().nullable().optional(),
});

export const blockRoutes = new Hono<AppEnv>()
  .get("/usage-counts", async (c) => {
    const result = await c.var.db
      .select({
        type: blocks.type,
        count: sql<number>`count(*)`,
      })
      .from(blocks)
      .groupBy(blocks.type);
    return c.json(result);
  })
  .post("/", zValidator("json", createBlockSchema), async (c) => {
    const { pageId, type, content, settings, afterPosition } = c.req.valid("json");
    const now = Date.now();
    const position = generateKeyBetween(afterPosition ?? null, null);
    const result = await c.var.db
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
    return c.json(result, 201);
  })
  .patch(
    "/:id{[0-9]+}/content",
    zValidator("json", z.object({ content: z.unknown() })),
    async (c) => {
      const id = Number(c.req.param("id"));
      const { content } = c.req.valid("json");
      const result = await c.var.db
        .update(blocks)
        .set({ content, updatedAt: Date.now() })
        .where(eq(blocks.id, id))
        .returning()
        .get();
      if (!result) return c.json({ error: "Not found" }, 404);
      return c.json(result);
    },
  )
  .patch(
    "/:id{[0-9]+}/settings",
    zValidator("json", z.object({ settings: z.unknown() })),
    async (c) => {
      const id = Number(c.req.param("id"));
      const { settings } = c.req.valid("json");
      const result = await c.var.db
        .update(blocks)
        .set({ settings, updatedAt: Date.now() })
        .where(eq(blocks.id, id))
        .returning()
        .get();
      if (!result) return c.json({ error: "Not found" }, 404);
      return c.json(result);
    },
  )
  .patch(
    "/:id{[0-9]+}/position",
    zValidator(
      "json",
      z.object({
        afterPosition: z.string().nullable().optional(),
        beforePosition: z.string().nullable().optional(),
      }),
    ),
    async (c) => {
      const id = Number(c.req.param("id"));
      const { afterPosition, beforePosition } = c.req.valid("json");
      const position = generateKeyBetween(afterPosition ?? null, beforePosition ?? null);
      const result = await c.var.db
        .update(blocks)
        .set({ position, updatedAt: Date.now() })
        .where(eq(blocks.id, id))
        .returning()
        .get();
      if (!result) return c.json({ error: "Not found" }, 404);
      return c.json(result);
    },
  )
  .delete("/:id{[0-9]+}", async (c) => {
    const id = Number(c.req.param("id"));
    const result = await c.var.db.delete(blocks).where(eq(blocks.id, id)).returning().get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .post(
    "/delete-many",
    zValidator("json", z.object({ blockIds: z.array(z.number()) })),
    async (c) => {
      const { blockIds } = c.req.valid("json");
      if (blockIds.length === 0) return c.json([]);
      const result = await c.var.db.delete(blocks).where(inArray(blocks.id, blockIds)).returning();
      return c.json(result);
    },
  )
  .post("/:id{[0-9]+}/duplicate", async (c) => {
    const id = Number(c.req.param("id"));
    const original = await c.var.db.select().from(blocks).where(eq(blocks.id, id)).get();
    if (!original) return c.json({ error: "Not found" }, 404);

    const now = Date.now();
    const position = generateKeyBetween(original.position, null);
    const result = await c.var.db
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
    return c.json(result, 201);
  });
