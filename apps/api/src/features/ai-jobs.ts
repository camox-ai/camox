import { int, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

// --- Schema only (no routes - internal/background jobs) ---

export const aiJobs = sqliteTable(
  "ai_jobs",
  {
    id: int().primaryKey({ autoIncrement: true }),
    entityTable: text("entity_table")
      .notNull()
      .$type<"repeatableItems" | "blocks" | "files" | "pages">(),
    entityId: text("entity_id").notNull(),
    type: text().notNull().$type<"summary" | "fileMetadata" | "seo">(),
    status: text()
      .notNull()
      .default("pending")
      .$type<"pending" | "running" | "completed" | "failed">(),
    createdAt: int("created_at").notNull(),
  },
  (table) => [index("ai_jobs_entity_idx").on(table.entityTable, table.entityId, table.type)],
);
