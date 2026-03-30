import { zValidator } from "@hono/zod-validator";
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { eq, sql } from "drizzle-orm";
import { int, sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import { outdent } from "outdent";
import { z } from "zod";

import { assertFileAccess, getAuthorizedProject } from "../authorization";
import type { Database } from "../db";
import { broadcastInvalidation } from "../lib/broadcast-invalidation";
import { scheduleAiJob } from "../lib/schedule-ai-job";
import type { AppEnv } from "../types";
import { blocks } from "./blocks";
import { projects } from "./projects";

// --- Schema ---

export const files = sqliteTable(
  "files",
  {
    id: int().primaryKey({ autoIncrement: true }),
    projectId: int("project_id").references(() => projects.id),
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
  (table) => [
    index("files_blob_id_idx").on(table.blobId),
    index("files_project_idx").on(table.projectId),
  ],
);

// --- AI Executor ---

async function generateImageMetadata(apiKey: string, imageUrl: string, currentFilename: string) {
  return await chat({
    adapter: createOpenRouterText("google/gemini-2.5-flash-lite", apiKey),
    outputSchema: z.object({
      filename: z.string(),
      alt: z.string(),
    }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image" as const,
            source: { type: "url" as const, value: imageUrl },
          },
          {
            type: "text" as const,
            content: outdent`
              Analyze this image and generate metadata for it:
              - "filename": a clean, descriptive filename in kebab-case (no extension). The current filename is "${currentFilename}". If it's already human-readable and descriptive, keep it as-is (without the extension). Only rewrite it if it's gibberish, a random hash, or not meaningful (e.g. "IMG_2847", "DSC0042", "a7f3b2c9").
              - "alt": SEO-optimized alt text describing the image content. Be concise but descriptive (1 sentence max).
            `,
          },
        ],
      },
    ],
  });
}

export async function executeFileMetadata(db: Database, apiKey: string, fileId: number) {
  const file = await db.select().from(files).where(eq(files.id, fileId)).get();
  if (!file || file.aiMetadataEnabled === false) return;

  const metadata = await generateImageMetadata(apiKey, file.url, file.filename);

  await db
    .update(files)
    .set({ filename: metadata.filename, alt: metadata.alt, updatedAt: Date.now() })
    .where(eq(files.id, fileId));
}

// --- Routes ---

export const fileRoutes = new Hono<AppEnv>()
  // File serving (public, no auth — files must be accessible on published sites)
  .get("/serve/*", async (c) => {
    const key = c.req.path.replace(/^\/files\/serve\//, "");
    if (!key) return c.json({ error: "Missing file key" }, 400);

    const object = await c.env.FILES_BUCKET.get(key);
    if (!object) return c.notFound();

    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": "inline",
      },
    });
  })
  // Public routes (no auth required)
  .get("/list", async (c) => {
    const result = await c.var.db.select().from(files);
    return c.json(result);
  })
  .get("/get", zValidator("query", z.object({ id: z.coerce.number() })), async (c) => {
    const { id } = c.req.valid("query");
    const result = await c.var.db.select().from(files).where(eq(files.id, id)).get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .get("/getUsageCount", zValidator("query", z.object({ id: z.coerce.number() })), async (c) => {
    const { id } = c.req.valid("query");
    const file = await c.var.db.select().from(files).where(eq(files.id, id)).get();
    if (!file) return c.json({ error: "Not found" }, 404);

    // Count blocks that reference this file's URL in their JSON content
    const result = await c.var.db
      .select({ count: sql<number>`count(*)` })
      .from(blocks)
      .where(sql`INSTR(${blocks.content}, ${file.url}) > 0`)
      .get();
    return c.json({ count: result?.count ?? 0 });
  })
  // Protected routes
  .post("/upload", async (c) => {
    const orgSlug = c.var.orgSlug!;
    const body = await c.req.parseBody();
    const file = body["file"];
    const projectId = Number(body["projectId"]);

    if (!(file instanceof File)) return c.json({ error: "Missing file" }, 400);
    if (!projectId || Number.isNaN(projectId)) return c.json({ error: "Missing projectId" }, 400);

    const project = await getAuthorizedProject(c.var.db, projectId, orgSlug);
    if (!project) return c.json({ error: "Not found" }, 404);

    const now = Date.now();
    const key = `${projectId}/${now}-${file.name}`;

    await c.env.FILES_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    const apiOrigin = new URL(c.req.url).origin;
    const url = `${apiOrigin}/files/serve/${key}`;

    const result = await c.var.db
      .insert(files)
      .values({
        projectId,
        blobId: key,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        path: key,
        url,
        alt: "",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    scheduleAiJob(c.env.AI_JOB_SCHEDULER, {
      entityTable: "files",
      entityId: result.id,
      type: "fileMetadata",
      delayMs: 0,
    });
    broadcastInvalidation(c.env.ProjectRoom, projectId, {
      entity: "file",
      action: "created",
      entityId: result.id,
    });

    return c.json(result, 201);
  })
  .post("/setAlt", zValidator("json", z.object({ id: z.number(), alt: z.string() })), async (c) => {
    const orgSlug = c.var.orgSlug!;
    const { id, alt } = c.req.valid("json");
    const access = await assertFileAccess(c.var.db, id, orgSlug);
    if (!access) return c.json({ error: "Not found" }, 404);

    const result = await c.var.db
      .update(files)
      .set({ alt, updatedAt: Date.now() })
      .where(eq(files.id, id))
      .returning()
      .get();
    broadcastInvalidation(c.env.ProjectRoom, access.file.projectId!, {
      entity: "file",
      action: "updated",
      entityId: id,
    });
    return c.json(result);
  })
  .post(
    "/setFilename",
    zValidator("json", z.object({ id: z.number(), filename: z.string() })),
    async (c) => {
      const orgSlug = c.var.orgSlug!;
      const { id, filename } = c.req.valid("json");
      const access = await assertFileAccess(c.var.db, id, orgSlug);
      if (!access) return c.json({ error: "Not found" }, 404);

      const result = await c.var.db
        .update(files)
        .set({ filename, updatedAt: Date.now() })
        .where(eq(files.id, id))
        .returning()
        .get();
      broadcastInvalidation(c.env.ProjectRoom, access.file.projectId!, {
        entity: "file",
        action: "updated",
        entityId: id,
      });
      return c.json(result);
    },
  )
  .post("/delete", zValidator("json", z.object({ id: z.number() })), async (c) => {
    const orgSlug = c.var.orgSlug!;
    const { id } = c.req.valid("json");
    const access = await assertFileAccess(c.var.db, id, orgSlug);
    if (!access) return c.json({ error: "Not found" }, 404);

    const result = await c.var.db.delete(files).where(eq(files.id, id)).returning().get();
    broadcastInvalidation(c.env.ProjectRoom, access.file.projectId!, {
      entity: "file",
      action: "deleted",
      entityId: id,
    });
    return c.json(result);
  })
  .post(
    "/replace",
    zValidator("json", z.object({ id: z.number(), newFileId: z.number() })),
    async (c) => {
      const orgSlug = c.var.orgSlug!;
      const { id, newFileId } = c.req.valid("json");

      const oldAccess = await assertFileAccess(c.var.db, id, orgSlug);
      const newAccess = await assertFileAccess(c.var.db, newFileId, orgSlug);
      if (!oldAccess || !newAccess) return c.json({ error: "Not found" }, 404);

      // Update all blocks that reference the old file URL
      await c.var.db.run(
        sql`UPDATE ${blocks} SET ${blocks.content} = REPLACE(CAST(${blocks.content} AS TEXT), ${oldAccess.file.url}, ${newAccess.file.url}), ${blocks.updatedAt} = ${Date.now()} WHERE INSTR(${blocks.content}, ${oldAccess.file.url}) > 0`,
      );

      broadcastInvalidation(c.env.ProjectRoom, oldAccess.file.projectId!, {
        entity: "file",
        action: "updated",
        entityId: id,
      });
      return c.json({ replaced: true });
    },
  )
  .post(
    "/setAiMetadata",
    zValidator("json", z.object({ id: z.number(), enabled: z.boolean() })),
    async (c) => {
      const orgSlug = c.var.orgSlug!;
      const { id, enabled } = c.req.valid("json");
      const access = await assertFileAccess(c.var.db, id, orgSlug);
      if (!access) return c.json({ error: "Not found" }, 404);

      const result = await c.var.db
        .update(files)
        .set({ aiMetadataEnabled: enabled, updatedAt: Date.now() })
        .where(eq(files.id, id))
        .returning()
        .get();
      broadcastInvalidation(c.env.ProjectRoom, access.file.projectId!, {
        entity: "file",
        action: "updated",
        entityId: id,
      });
      return c.json(result);
    },
  )
  .post("/generateMetadata", zValidator("json", z.object({ id: z.number() })), async (c) => {
    const orgSlug = c.var.orgSlug!;
    const { id } = c.req.valid("json");
    const access = await assertFileAccess(c.var.db, id, orgSlug);
    if (!access) return c.json({ error: "Not found" }, 404);

    await executeFileMetadata(c.var.db, c.env.OPEN_ROUTER_API_KEY, id);
    broadcastInvalidation(c.env.ProjectRoom, access.file.projectId!, {
      entity: "file",
      action: "updated",
      entityId: id,
    });
    const updated = await c.var.db.select().from(files).where(eq(files.id, id)).get();
    return c.json(updated);
  });
