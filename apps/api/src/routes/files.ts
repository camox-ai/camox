import { ORPCError } from "@orpc/server";
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { outdent } from "outdent";
import { z } from "zod";

import { assertFileAccess, getAuthorizedProject, requireOrg } from "../authorization";
import type { Database } from "../db";
import { broadcastInvalidation } from "../lib/broadcast-invalidation";
import { queryKeys } from "../lib/query-keys";
import { scheduleAiJob } from "../lib/schedule-ai-job";
import { pub, authed } from "../orpc";
import { blocks, files } from "../schema";
import type { AppEnv } from "../types";

// --- AI Executor ---

async function generateImageMetadata(apiKey: string, imageUrl: string, currentFilename: string) {
  // Fetch image server-side — the AI provider can't reach localhost URLs in development
  const response = await fetch(imageUrl);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const mimeType = response.headers.get("content-type") || "image/jpeg";

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
            source: { type: "data" as const, value: base64, mimeType: mimeType as "image/png" },
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

// --- oRPC Procedures ---

const list = pub.handler(async ({ context }) => {
  return context.db.select().from(files);
});

const get = pub.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const result = await context.db.select().from(files).where(eq(files.id, input.id)).get();
  if (!result) throw new ORPCError("NOT_FOUND");
  return result;
});

const getUsageCount = pub
  .input(z.object({ id: z.number() }))
  .handler(async ({ context, input }) => {
    const file = await context.db.select().from(files).where(eq(files.id, input.id)).get();
    if (!file) throw new ORPCError("NOT_FOUND");

    const result = await context.db
      .select({ count: sql<number>`count(*)` })
      .from(blocks)
      .where(sql`INSTR(${blocks.content}, ${file.url}) > 0`)
      .get();
    return { count: result?.count ?? 0 };
  });

const setAlt = authed
  .input(z.object({ id: z.number(), alt: z.string() }))
  .handler(async ({ context, input }) => {
    const access = await assertFileAccess(context.db, input.id, context.orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    const result = await context.db
      .update(files)
      .set({ alt: input.alt, updatedAt: Date.now() })
      .where(eq(files.id, input.id))
      .returning()
      .get();
    broadcastInvalidation(context.env.ProjectRoom, access.file.projectId!, [
      queryKeys.files.list,
      queryKeys.files.get(input.id),
    ]);
    return result;
  });

const setFilename = authed
  .input(z.object({ id: z.number(), filename: z.string() }))
  .handler(async ({ context, input }) => {
    const access = await assertFileAccess(context.db, input.id, context.orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    const result = await context.db
      .update(files)
      .set({ filename: input.filename, updatedAt: Date.now() })
      .where(eq(files.id, input.id))
      .returning()
      .get();
    broadcastInvalidation(context.env.ProjectRoom, access.file.projectId!, [
      queryKeys.files.list,
      queryKeys.files.get(input.id),
    ]);
    return result;
  });

const deleteFn = authed.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const access = await assertFileAccess(context.db, input.id, context.orgSlug);
  if (!access) throw new ORPCError("NOT_FOUND");

  const result = await context.db.delete(files).where(eq(files.id, input.id)).returning().get();
  broadcastInvalidation(context.env.ProjectRoom, access.file.projectId!, [
    queryKeys.files.list,
    queryKeys.files.get(input.id),
  ]);
  return result;
});

const replace = authed
  .input(z.object({ id: z.number(), newFileId: z.number() }))
  .handler(async ({ context, input }) => {
    const oldAccess = await assertFileAccess(context.db, input.id, context.orgSlug);
    const newAccess = await assertFileAccess(context.db, input.newFileId, context.orgSlug);
    if (!oldAccess || !newAccess) throw new ORPCError("NOT_FOUND");

    // Update all blocks that reference the old file URL
    await context.db.run(
      sql`UPDATE ${blocks} SET ${blocks.content} = REPLACE(CAST(${blocks.content} AS TEXT), ${oldAccess.file.url}, ${newAccess.file.url}), ${blocks.updatedAt} = ${Date.now()} WHERE INSTR(${blocks.content}, ${oldAccess.file.url}) > 0`,
    );

    broadcastInvalidation(context.env.ProjectRoom, oldAccess.file.projectId!, [
      queryKeys.files.list,
      queryKeys.files.get(input.id),
    ]);
    return { replaced: true };
  });

const setAiMetadata = authed
  .input(z.object({ id: z.number(), enabled: z.boolean() }))
  .handler(async ({ context, input }) => {
    const access = await assertFileAccess(context.db, input.id, context.orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    const result = await context.db
      .update(files)
      .set({ aiMetadataEnabled: input.enabled, updatedAt: Date.now() })
      .where(eq(files.id, input.id))
      .returning()
      .get();
    broadcastInvalidation(context.env.ProjectRoom, access.file.projectId!, [
      queryKeys.files.list,
      queryKeys.files.get(input.id),
    ]);
    return result;
  });

const generateMetadata = authed
  .input(z.object({ id: z.number() }))
  .handler(async ({ context, input }) => {
    const access = await assertFileAccess(context.db, input.id, context.orgSlug);
    if (!access) throw new ORPCError("NOT_FOUND");

    await executeFileMetadata(context.db, context.env.OPEN_ROUTER_API_KEY, input.id);
    broadcastInvalidation(context.env.ProjectRoom, access.file.projectId!, [
      queryKeys.files.list,
      queryKeys.files.get(input.id),
    ]);
    const updated = await context.db.select().from(files).where(eq(files.id, input.id)).get();
    return updated;
  });

export const fileProcedures = {
  list,
  get,
  getUsageCount,
  setAlt,
  setFilename,
  delete: deleteFn,
  replace,
  setAiMetadata,
  generateMetadata,
};

// --- Hono routes (binary serving + multipart upload) ---

export const fileHonoRoutes = new Hono<AppEnv>();

fileHonoRoutes.get("/serve/*", async (c) => {
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
});

fileHonoRoutes.post(
  "/upload",
  (c, next) => requireOrg(c, next),
  async (c) => {
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
    broadcastInvalidation(c.env.ProjectRoom, projectId, [
      queryKeys.files.list,
      queryKeys.files.get(result.id),
    ]);

    return c.json(result, 201);
  },
);
