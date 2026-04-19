import { queryKeys } from "@camox/api-contract/query-keys";
import { ORPCError } from "@orpc/server";
import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { outdent } from "outdent";
import { z } from "zod";

import { assertFileAccess, getAuthorizedProject } from "../authorization";
import type { Database } from "../db";
import { broadcastInvalidation } from "../lib/broadcast-invalidation";
import { resolveEnvironment } from "../lib/resolve-environment";
import { scheduleAiJob } from "../lib/schedule-ai-job";
import { pub, authed } from "../orpc";
import { blocks, files, member, projects, repeatableItems } from "../schema";
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

// --- File reference cleanup ---

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function cleanFileReferences(value: JsonValue, fileId: number): JsonValue {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value
      .filter((entry) => !containsFileRef(entry, fileId))
      .map((entry) => cleanFileReferences(entry, fileId) as JsonValue);
  }

  // Object with _fileId — direct file reference
  if ("_fileId" in value && value._fileId === fileId) return null;

  // Recurse into object properties
  const cleaned: Record<string, JsonValue> = {};
  for (const [k, v] of Object.entries(value)) {
    cleaned[k] = cleanFileReferences(v as JsonValue, fileId);
  }
  return cleaned;
}

function containsFileRef(value: JsonValue, fileId: number): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => containsFileRef(v, fileId));
  if ("_fileId" in value && value._fileId === fileId) return true;
  return Object.values(value).some((v) => containsFileRef(v as JsonValue, fileId));
}

async function removeFileReferences(db: Database, fileId: number) {
  const marker = `"_fileId":${fileId}`;
  const now = Date.now();

  const affectedBlocks = await db
    .select({ id: blocks.id, content: blocks.content, pageId: blocks.pageId })
    .from(blocks)
    .where(sql`INSTR(${blocks.content}, ${marker}) > 0`);

  const affectedItems = await db
    .select({
      id: repeatableItems.id,
      content: repeatableItems.content,
      blockId: repeatableItems.blockId,
    })
    .from(repeatableItems)
    .where(sql`INSTR(${repeatableItems.content}, ${marker}) > 0`);

  for (const block of affectedBlocks) {
    const cleaned = cleanFileReferences(block.content as JsonValue, fileId);
    await db
      .update(blocks)
      .set({ content: cleaned, updatedAt: now })
      .where(eq(blocks.id, block.id));
  }

  for (const item of affectedItems) {
    const cleaned = cleanFileReferences(item.content as JsonValue, fileId);
    await db
      .update(repeatableItems)
      .set({ content: cleaned, updatedAt: now })
      .where(eq(repeatableItems.id, item.id));
  }

  const itemBlockIds = affectedItems.map((i) => i.blockId);
  const allBlockIds = [...new Set([...affectedBlocks.map((b) => b.id), ...itemBlockIds])];

  // Look up pageIds for blocks referenced by affected repeatable items
  let itemBlockPageIds: number[] = [];
  if (itemBlockIds.length > 0) {
    const uniqueItemBlockIds = [...new Set(itemBlockIds)];
    const parentBlocks = await db
      .select({ id: blocks.id, pageId: blocks.pageId })
      .from(blocks)
      .where(inArray(blocks.id, uniqueItemBlockIds));
    itemBlockPageIds = parentBlocks.map((b) => b.pageId).filter((id) => id != null);
  }

  const allPageIds = [
    ...new Set([
      ...affectedBlocks.map((b) => b.pageId).filter((id) => id != null),
      ...itemBlockPageIds,
    ]),
  ];

  return {
    blockIds: allBlockIds,
    blockPageIds: allPageIds,
    itemIds: affectedItems.map((i) => i.id),
  };
}

// --- oRPC Procedures ---

const list = pub.input(z.object({ projectId: z.number() })).handler(async ({ context, input }) => {
  const environment = await resolveEnvironment(
    context.db,
    input.projectId,
    context.environmentName,
  );
  return context.db
    .select()
    .from(files)
    .where(and(eq(files.projectId, input.projectId), eq(files.environmentId, environment.id)));
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

    const marker = `"_fileId":${file.id}`;
    const blockCount = await context.db
      .select({ count: sql<number>`count(*)` })
      .from(blocks)
      .where(sql`INSTR(${blocks.content}, ${marker}) > 0`)
      .get();
    const itemCount = await context.db
      .select({ count: sql<number>`count(*)` })
      .from(repeatableItems)
      .where(sql`INSTR(${repeatableItems.content}, ${marker}) > 0`)
      .get();
    return { count: (blockCount?.count ?? 0) + (itemCount?.count ?? 0) };
  });

const setAlt = authed
  .input(z.object({ id: z.number(), alt: z.string() }))
  .handler(async ({ context, input }) => {
    const access = await assertFileAccess(context.db, input.id, context.user.id);
    if (!access) throw new ORPCError("NOT_FOUND");

    const result = await context.db
      .update(files)
      .set({ alt: input.alt, updatedAt: Date.now() })
      .where(eq(files.id, input.id))
      .returning()
      .get();
    broadcastInvalidation(context.env.EnvironmentRoom, access.file.environmentId!, [
      queryKeys.files.list,
      queryKeys.files.get(input.id),
    ]);
    return result;
  });

const setFilename = authed
  .input(z.object({ id: z.number(), filename: z.string() }))
  .handler(async ({ context, input }) => {
    const access = await assertFileAccess(context.db, input.id, context.user.id);
    if (!access) throw new ORPCError("NOT_FOUND");

    const result = await context.db
      .update(files)
      .set({ filename: input.filename, updatedAt: Date.now() })
      .where(eq(files.id, input.id))
      .returning()
      .get();
    broadcastInvalidation(context.env.EnvironmentRoom, access.file.environmentId!, [
      queryKeys.files.list,
      queryKeys.files.get(input.id),
    ]);
    return result;
  });

const deleteFn = authed.input(z.object({ id: z.number() })).handler(async ({ context, input }) => {
  const access = await assertFileAccess(context.db, input.id, context.user.id);
  if (!access) throw new ORPCError("NOT_FOUND");

  const { blockIds, blockPageIds, itemIds } = await removeFileReferences(context.db, input.id);

  await context.env.FILES_BUCKET.delete(access.file.blobId);
  const result = await context.db.delete(files).where(eq(files.id, input.id)).returning().get();
  broadcastInvalidation(context.env.EnvironmentRoom, access.file.environmentId!, [
    queryKeys.files.list,
    queryKeys.files.get(input.id),
    ...blockIds.map((id) => queryKeys.blocks.get(id)),
    ...blockPageIds.map((id) => queryKeys.blocks.getPageMarkdown(id)),
    ...itemIds.map((id) => queryKeys.repeatableItems.get(id)),
    ...(blockIds.length > 0 || itemIds.length > 0
      ? [queryKeys.blocks.getUsageCounts, queryKeys.pages.getByPathAll]
      : []),
  ]);
  return result;
});

const deleteMany = authed
  .input(z.object({ ids: z.array(z.number()) }))
  .handler(async ({ context, input }) => {
    const { ids } = input;
    if (ids.length === 0) return [];

    const authorizedFiles = await context.db
      .select({
        id: files.id,
        blobId: files.blobId,
        projectId: files.projectId,
        environmentId: files.environmentId,
      })
      .from(files)
      .innerJoin(projects, eq(projects.id, files.projectId))
      .innerJoin(
        member,
        and(eq(member.organizationId, projects.organizationId), eq(member.userId, context.user.id)),
      )
      .where(inArray(files.id, ids));

    if (authorizedFiles.length !== ids.length) {
      throw new ORPCError("FORBIDDEN");
    }

    const allBlockIds: number[] = [];
    const allBlockPageIds: number[] = [];
    const allItemIds: number[] = [];
    for (const id of ids) {
      const { blockIds, blockPageIds, itemIds } = await removeFileReferences(context.db, id);
      allBlockIds.push(...blockIds);
      allBlockPageIds.push(...blockPageIds);
      allItemIds.push(...itemIds);
    }

    await Promise.all(authorizedFiles.map((f) => context.env.FILES_BUCKET.delete(f.blobId)));
    await context.db.delete(files).where(inArray(files.id, ids));

    const environmentId = authorizedFiles[0]!.environmentId!;
    const uniqueBlockIds = [...new Set(allBlockIds)];
    const uniqueBlockPageIds = [...new Set(allBlockPageIds)];
    const uniqueItemIds = [...new Set(allItemIds)];
    broadcastInvalidation(context.env.EnvironmentRoom, environmentId, [
      queryKeys.files.list,
      ...ids.map((id) => queryKeys.files.get(id)),
      ...uniqueBlockIds.map((id) => queryKeys.blocks.get(id)),
      ...uniqueBlockPageIds.map((id) => queryKeys.blocks.getPageMarkdown(id)),
      ...uniqueItemIds.map((id) => queryKeys.repeatableItems.get(id)),
      ...(uniqueBlockIds.length > 0 || uniqueItemIds.length > 0
        ? [queryKeys.blocks.getUsageCounts, queryKeys.pages.getByPathAll]
        : []),
    ]);
    return ids;
  });

const replace = authed
  .input(z.object({ id: z.number(), newFileId: z.number() }))
  .handler(async ({ context, input }) => {
    const oldAccess = await assertFileAccess(context.db, input.id, context.user.id);
    const newAccess = await assertFileAccess(context.db, input.newFileId, context.user.id);
    if (!oldAccess || !newAccess) throw new ORPCError("NOT_FOUND");

    // Update all blocks that reference the old file URL
    await context.db.run(
      sql`UPDATE ${blocks} SET ${blocks.content} = REPLACE(CAST(${blocks.content} AS TEXT), ${oldAccess.file.url}, ${newAccess.file.url}), ${blocks.updatedAt} = ${Date.now()} WHERE INSTR(${blocks.content}, ${oldAccess.file.url}) > 0`,
    );

    broadcastInvalidation(context.env.EnvironmentRoom, oldAccess.file.environmentId!, [
      queryKeys.files.list,
      queryKeys.files.get(input.id),
    ]);
    return { replaced: true };
  });

const setAiMetadata = authed
  .input(z.object({ id: z.number(), enabled: z.boolean() }))
  .handler(async ({ context, input }) => {
    const access = await assertFileAccess(context.db, input.id, context.user.id);
    if (!access) throw new ORPCError("NOT_FOUND");

    const result = await context.db
      .update(files)
      .set({ aiMetadataEnabled: input.enabled, updatedAt: Date.now() })
      .where(eq(files.id, input.id))
      .returning()
      .get();
    if (input.enabled) {
      scheduleAiJob(context.env.AI_JOB_SCHEDULER, {
        entityTable: "files",
        entityId: input.id,
        type: "fileMetadata",
        delayMs: 0,
      });
    }
    broadcastInvalidation(context.env.EnvironmentRoom, access.file.environmentId!, [
      queryKeys.files.list,
      queryKeys.files.get(input.id),
    ]);
    return result;
  });

const generateMetadata = authed
  .input(z.object({ id: z.number() }))
  .handler(async ({ context, input }) => {
    const access = await assertFileAccess(context.db, input.id, context.user.id);
    if (!access) throw new ORPCError("NOT_FOUND");

    await executeFileMetadata(context.db, context.env.OPEN_ROUTER_API_KEY, input.id);
    broadcastInvalidation(context.env.EnvironmentRoom, access.file.environmentId!, [
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
  deleteMany,
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

fileHonoRoutes.post("/upload", async (c) => {
  if (!c.var.user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.parseBody();
  const file = body["file"];
  const projectId = Number(body["projectId"]);

  if (!(file instanceof File)) return c.json({ error: "Missing file" }, 400);
  if (!projectId || Number.isNaN(projectId)) return c.json({ error: "Missing projectId" }, 400);

  const project = await getAuthorizedProject(c.var.db, projectId, c.var.user.id);
  if (!project) return c.json({ error: "Not found" }, 404);

  const environment = await resolveEnvironment(c.var.db, projectId, c.var.environmentName);

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
      environmentId: environment.id,
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
  broadcastInvalidation(c.env.EnvironmentRoom, environment.id, [
    queryKeys.files.list,
    queryKeys.files.get(result.id),
  ]);

  return c.json(result, 201);
});
