import type { MutationCtx } from "../_generated/server";

type EntityTable = "repeatableItems" | "blocks" | "files" | "pages";
type JobType = "summary" | "fileMetadata" | "seo";

export async function scheduleAiJob(
  ctx: MutationCtx,
  options: {
    entityTable: EntityTable;
    entityId: string;
    type: JobType;
    delayMs: number;
    fn: any;
    fnArgs: Record<string, any>;
  },
) {
  const { entityTable, entityId, type, delayMs, fn, fnArgs } = options;

  // Cancel existing job for this entity+type
  const existing = await ctx.db
    .query("aiJobs")
    .withIndex("by_entity", (q) =>
      q.eq("entityTable", entityTable).eq("entityId", entityId).eq("type", type),
    )
    .unique();

  if (existing) {
    await ctx.scheduler.cancel(existing.scheduledFunctionId);
    await ctx.db.delete(existing._id);
  }

  // Schedule new job
  const scheduledFunctionId = await ctx.scheduler.runAfter(delayMs, fn, fnArgs);

  await ctx.db.insert("aiJobs", {
    entityTable,
    entityId,
    type,
    scheduledFunctionId,
    createdAt: Date.now(),
  });
}

export async function clearAiJob(
  ctx: MutationCtx,
  options: {
    entityTable: EntityTable;
    entityId: string;
    type: JobType;
  },
) {
  const { entityTable, entityId, type } = options;

  const existing = await ctx.db
    .query("aiJobs")
    .withIndex("by_entity", (q) =>
      q.eq("entityTable", entityTable).eq("entityId", entityId).eq("type", type),
    )
    .unique();

  if (existing) {
    await ctx.scheduler.cancel(existing.scheduledFunctionId);
    await ctx.db.delete(existing._id);
  }
}
