import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { int, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../types";
import { blocks } from "./blocks";

// --- Schema ---

export const files = sqliteTable(
  "files",
  {
    id: int().primaryKey({ autoIncrement: true }),
    url: text().notNull(),
    alt: text().notNull().default(""),
    filename: text().notNull(),
    mimeType: text("mime_type").notNull(),
    size: int().notNull(),
    blobId: text("blob_id").notNull(),
    path: text().notNull(),
    aiMetadataEnabled: int("ai_metadata_enabled", { mode: "boolean" }),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [index("files_blob_id_idx").on(table.blobId)],
);

// --- Routes ---

const commitFileSchema = z.object({
  blobId: z.string(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
  siteUrl: z.string(),
});

export const fileRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const result = await c.var.db.select().from(files);
    return c.json(result);
  })
  .get("/:id{[0-9]+}", async (c) => {
    const result = await c.var.db
      .select()
      .from(files)
      .where(eq(files.id, Number(c.req.param("id"))))
      .get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .get("/:id{[0-9]+}/usage-count", async (c) => {
    const fileId = Number(c.req.param("id"));
    const file = await c.var.db.select().from(files).where(eq(files.id, fileId)).get();
    if (!file) return c.json({ error: "Not found" }, 404);

    // Count blocks that reference this file's URL in their JSON content
    const result = await c.var.db
      .select({ count: sql<number>`count(*)` })
      .from(blocks)
      .where(sql`json_extract(${blocks.content}, '$') LIKE ${"%" + file.url + "%"}`)
      .get();
    return c.json({ count: result?.count ?? 0 });
  })
  .post("/", zValidator("json", commitFileSchema), async (c) => {
    const { blobId, filename, contentType, size, siteUrl } = c.req.valid("json");
    const now = Date.now();
    const path = `/files/${blobId}/${filename}`;
    const url = `${siteUrl}${path}`;
    const result = await c.var.db
      .insert(files)
      .values({
        blobId,
        filename,
        mimeType: contentType,
        size,
        path,
        url,
        alt: "",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return c.json(result, 201);
  })
  .patch("/:id{[0-9]+}/alt", zValidator("json", z.object({ alt: z.string() })), async (c) => {
    const id = Number(c.req.param("id"));
    const { alt } = c.req.valid("json");
    const result = await c.var.db
      .update(files)
      .set({ alt, updatedAt: Date.now() })
      .where(eq(files.id, id))
      .returning()
      .get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .patch(
    "/:id{[0-9]+}/filename",
    zValidator("json", z.object({ filename: z.string() })),
    async (c) => {
      const id = Number(c.req.param("id"));
      const { filename } = c.req.valid("json");
      const result = await c.var.db
        .update(files)
        .set({ filename, updatedAt: Date.now() })
        .where(eq(files.id, id))
        .returning()
        .get();
      if (!result) return c.json({ error: "Not found" }, 404);
      return c.json(result);
    },
  )
  .delete("/:id{[0-9]+}", async (c) => {
    const id = Number(c.req.param("id"));
    const result = await c.var.db.delete(files).where(eq(files.id, id)).returning().get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .post(
    "/:id{[0-9]+}/replace",
    zValidator("json", z.object({ newFileId: z.number() })),
    async (c) => {
      const oldId = Number(c.req.param("id"));
      const { newFileId } = c.req.valid("json");

      const oldFile = await c.var.db.select().from(files).where(eq(files.id, oldId)).get();
      const newFile = await c.var.db.select().from(files).where(eq(files.id, newFileId)).get();
      if (!oldFile || !newFile) return c.json({ error: "Not found" }, 404);

      // Update all blocks that reference the old file URL
      await c.var.db.run(
        sql`UPDATE ${blocks} SET ${blocks.content} = REPLACE(CAST(${blocks.content} AS TEXT), ${oldFile.url}, ${newFile.url}), ${blocks.updatedAt} = ${Date.now()} WHERE CAST(${blocks.content} AS TEXT) LIKE ${"%" + oldFile.url + "%"}`,
      );

      return c.json({ replaced: true });
    },
  )
  .patch(
    "/:id{[0-9]+}/ai-metadata",
    zValidator("json", z.object({ enabled: z.boolean() })),
    async (c) => {
      const id = Number(c.req.param("id"));
      const { enabled } = c.req.valid("json");
      const result = await c.var.db
        .update(files)
        .set({ aiMetadataEnabled: enabled, updatedAt: Date.now() })
        .where(eq(files.id, id))
        .returning()
        .get();
      if (!result) return c.json({ error: "Not found" }, 404);
      return c.json(result);
    },
  );
