import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { int, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../types";
import { layouts } from "./layouts";
import { projects } from "./projects";

// --- Schema ---

export const pages = sqliteTable(
  "pages",
  {
    id: int().primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id),
    pathSegment: text("path_segment").notNull(),
    fullPath: text("full_path").notNull(),
    parentPageId: int("parent_page_id"),
    layoutId: int("layout_id")
      .notNull()
      .references(() => layouts.id),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    aiSeoEnabled: int("ai_seo_enabled", { mode: "boolean" }),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    index("pages_full_path_idx").on(table.fullPath),
    index("pages_parent_idx").on(table.parentPageId),
    index("pages_project_idx").on(table.projectId),
  ],
);

// --- Routes ---

const updatePageSchema = z.object({
  pathSegment: z.string(),
  parentPageId: z.number().nullable().optional(),
});

export const pageRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const result = await c.var.db.select().from(pages);
    return c.json(result);
  })
  .get("/by-path", async (c) => {
    const fullPath = c.req.query("path");
    if (!fullPath) return c.json({ error: "path required" }, 400);
    const result = await c.var.db.select().from(pages).where(eq(pages.fullPath, fullPath)).get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .get("/:id{[0-9]+}", async (c) => {
    const result = await c.var.db
      .select()
      .from(pages)
      .where(eq(pages.id, Number(c.req.param("id"))))
      .get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .patch("/:id{[0-9]+}", zValidator("json", updatePageSchema), async (c) => {
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");
    const result = await c.var.db
      .update(pages)
      .set({ ...body, updatedAt: Date.now() })
      .where(eq(pages.id, id))
      .returning()
      .get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .delete("/:id{[0-9]+}", async (c) => {
    const id = Number(c.req.param("id"));
    const result = await c.var.db.delete(pages).where(eq(pages.id, id)).returning().get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .patch(
    "/:id{[0-9]+}/ai-seo",
    zValidator("json", z.object({ enabled: z.boolean() })),
    async (c) => {
      const id = Number(c.req.param("id"));
      const { enabled } = c.req.valid("json");
      const result = await c.var.db
        .update(pages)
        .set({ aiSeoEnabled: enabled, updatedAt: Date.now() })
        .where(eq(pages.id, id))
        .returning()
        .get();
      if (!result) return c.json({ error: "Not found" }, 404);
      return c.json(result);
    },
  )
  .patch(
    "/:id{[0-9]+}/meta-title",
    zValidator("json", z.object({ metaTitle: z.string() })),
    async (c) => {
      const id = Number(c.req.param("id"));
      const { metaTitle } = c.req.valid("json");
      const result = await c.var.db
        .update(pages)
        .set({ metaTitle, updatedAt: Date.now() })
        .where(eq(pages.id, id))
        .returning()
        .get();
      if (!result) return c.json({ error: "Not found" }, 404);
      return c.json(result);
    },
  )
  .patch(
    "/:id{[0-9]+}/meta-description",
    zValidator("json", z.object({ metaDescription: z.string() })),
    async (c) => {
      const id = Number(c.req.param("id"));
      const { metaDescription } = c.req.valid("json");
      const result = await c.var.db
        .update(pages)
        .set({ metaDescription, updatedAt: Date.now() })
        .where(eq(pages.id, id))
        .returning()
        .get();
      if (!result) return c.json({ error: "Not found" }, 404);
      return c.json(result);
    },
  )
  .patch(
    "/:id{[0-9]+}/layout",
    zValidator("json", z.object({ layoutId: z.number() })),
    async (c) => {
      const id = Number(c.req.param("id"));
      const { layoutId } = c.req.valid("json");
      const result = await c.var.db
        .update(pages)
        .set({ layoutId, updatedAt: Date.now() })
        .where(eq(pages.id, id))
        .returning()
        .get();
      if (!result) return c.json({ error: "Not found" }, 404);
      return c.json(result);
    },
  );
