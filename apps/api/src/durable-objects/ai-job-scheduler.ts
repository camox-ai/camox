import { queryKeys } from "@camox/api-contract/query-keys";
import { DurableObject } from "cloudflare:workers";
import { eq, or, sql } from "drizzle-orm";

import { createDb } from "../db";
import { broadcastInvalidation } from "../lib/broadcast-invalidation";
import { executeBlockSummary } from "../routes/blocks";
import { executeFileMetadata } from "../routes/files";
import { executePageSeo } from "../routes/pages";
import { executeRepeatableItemSummary } from "../routes/repeatable-items";
import { blocks, files, layouts, pages, projects, repeatableItems } from "../schema";
import type { Bindings } from "../types";

type JobParams = {
  entityTable: string;
  entityId: number;
  type: string;
  delayMs: number;
};

export class AiJobScheduler extends DurableObject<Bindings> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/schedule") {
      const params: JobParams = await request.json();
      await this.ctx.storage.put("job", params);
      await this.ctx.storage.setAlarm(Date.now() + params.delayMs);
      return new Response(JSON.stringify({ scheduled: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    const params = await this.ctx.storage.get<JobParams>("job");
    if (!params) return;

    await this.ctx.storage.delete("job");

    const db = createDb(this.env.DB);
    const apiKey = this.env.OPEN_ROUTER_API_KEY;

    const { entityTable, entityId, type } = params;

    if (entityTable === "blocks" && type === "summary") {
      const seoStale = await executeBlockSummary(db, apiKey, entityId);
      if (seoStale) {
        // Cascade: schedule page SEO regeneration
        const { scheduleAiJob } = await import("../lib/schedule-ai-job");
        scheduleAiJob(this.env.AI_JOB_SCHEDULER, {
          entityTable: "pages",
          entityId: seoStale.pageId,
          type: "seo",
          delayMs: 15000,
        });
      }

      // Broadcast block summary update
      const environmentId = await this.getBlockEnvironmentId(db, entityId);
      if (environmentId) {
        broadcastInvalidation(this.env.EnvironmentRoom, environmentId, [
          queryKeys.pages.getByPathAll,
          queryKeys.blocks.getUsageCounts,
        ]);
      }
    } else if (entityTable === "repeatableItems" && type === "summary") {
      const cascade = await executeRepeatableItemSummary(db, apiKey, entityId);
      if (cascade) {
        // Cascade: schedule parent block summary regeneration
        const { scheduleAiJob } = await import("../lib/schedule-ai-job");
        scheduleAiJob(this.env.AI_JOB_SCHEDULER, {
          entityTable: "blocks",
          entityId: cascade.blockId,
          type: "summary",
          delayMs: 5000,
        });
      }

      // Broadcast repeatable item summary update
      const item = await db
        .select()
        .from(repeatableItems)
        .where(eq(repeatableItems.id, entityId))
        .get();
      if (item) {
        const environmentId = await this.getBlockEnvironmentId(db, item.blockId);
        if (environmentId) {
          broadcastInvalidation(this.env.EnvironmentRoom, environmentId, [
            queryKeys.pages.getByPathAll,
            queryKeys.blocks.getUsageCounts,
          ]);
        }
      }
    } else if (entityTable === "files" && type === "fileMetadata") {
      await executeFileMetadata(db, apiKey, entityId);

      const file = await db.select().from(files).where(eq(files.id, entityId)).get();
      if (file?.environmentId) {
        broadcastInvalidation(this.env.EnvironmentRoom, file.environmentId, [
          queryKeys.files.list,
          queryKeys.files.get(entityId),
        ]);
      }
    } else if (entityTable === "pages" && type === "seo") {
      await executePageSeo(db, apiKey, entityId);

      const page = await db.select().from(pages).where(eq(pages.id, entityId)).get();
      if (page) {
        broadcastInvalidation(this.env.EnvironmentRoom, page.environmentId, [
          queryKeys.pages.list,
          queryKeys.pages.getById(entityId),
        ]);
      }
    }
  }

  private async getBlockEnvironmentId(
    db: ReturnType<typeof createDb>,
    blockId: number,
  ): Promise<number | null> {
    const result = await db
      .select({
        environmentId: sql<number>`coalesce(${pages.environmentId}, ${layouts.environmentId})`,
      })
      .from(blocks)
      .leftJoin(pages, eq(blocks.pageId, pages.id))
      .leftJoin(layouts, eq(blocks.layoutId, layouts.id))
      .innerJoin(projects, or(eq(projects.id, pages.projectId), eq(projects.id, layouts.projectId)))
      .where(eq(blocks.id, blockId))
      .get();
    return result?.environmentId ?? null;
  }
}
