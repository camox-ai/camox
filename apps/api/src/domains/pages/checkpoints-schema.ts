import { index, int, sqliteTable, text, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import { user } from "../auth/schema";
import { pages } from "./schema";

export const pageCheckpoints = sqliteTable(
  "page_checkpoints",
  {
    id: int().primaryKey({ autoIncrement: true }),
    pageId: int("page_id")
      .notNull()
      .references((): AnySQLiteColumn => pages.id, { onDelete: "cascade" }),
    kind: text().notNull().$type<"auto-publish" | "manual" | "auto-draft">(),
    label: text(),
    snapshot: text().notNull(),
    schemaVersion: int("schema_version").notNull(),
    createdAt: int("created_at").notNull(),
    createdBy: text("created_by").references(() => user.id),
  },
  (table) => [index("page_checkpoints_page_created_idx").on(table.pageId, table.createdAt)],
);
