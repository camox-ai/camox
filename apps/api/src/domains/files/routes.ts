import { queryKeys } from "@camox/api-contract/query-keys";
import { Hono } from "hono";

import { getAuthorizedProject } from "../../authorization";
import { broadcastInvalidation } from "../../lib/broadcast-invalidation";
import { resolveEnvironment } from "../../lib/resolve-environment";
import { scheduleAiJob } from "../../lib/schedule-ai-job";
import { authed, pub } from "../../orpc";
import { files } from "../../schema";
import type { AppEnv } from "../../types";
import * as service from "./service";

// Public procedures

const list = pub
  .input(service.listFilesInput)
  .handler(({ context, input }) => service.listFiles(context, input));

const get = pub
  .input(service.getFileInput)
  .handler(({ context, input }) => service.getFile(context, input));

const getUsageCount = pub
  .input(service.getFileUsageCountInput)
  .handler(({ context, input }) => service.getFileUsageCount(context, input));

// Protected procedures

const setAlt = authed
  .input(service.setFileAltInput)
  .handler(({ context, input }) => service.setFileAlt(context, input));

const setFilename = authed
  .input(service.setFileFilenameInput)
  .handler(({ context, input }) => service.setFileFilename(context, input));

const deleteFn = authed
  .input(service.deleteFileInput)
  .handler(({ context, input }) => service.deleteFile(context, input));

const deleteMany = authed
  .input(service.deleteFilesInput)
  .handler(({ context, input }) => service.deleteFiles(context, input));

const replace = authed
  .input(service.replaceFileInput)
  .handler(({ context, input }) => service.replaceFile(context, input));

const setAiMetadata = authed
  .input(service.setFileAiMetadataInput)
  .handler(({ context, input }) => service.setFileAiMetadata(context, input));

const generateMetadata = authed
  .input(service.generateFileMetadataInput)
  .handler(({ context, input }) => service.generateFileMetadata(context, input));

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

  c.executionCtx.waitUntil(
    scheduleAiJob(c.env.AI_JOB_SCHEDULER, {
      entityTable: "files",
      entityId: result.id,
      type: "fileMetadata",
      delayMs: 0,
    }),
  );
  broadcastInvalidation({
    waitUntil: (p) => c.executionCtx.waitUntil(p),
    projectRoomNamespace: c.env.ProjectRoom,
    projectId,
    targets: [queryKeys.files.list, queryKeys.files.get(result.id)],
  });

  return c.json(result, 201);
});
