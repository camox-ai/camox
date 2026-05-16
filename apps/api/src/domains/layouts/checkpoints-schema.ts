import { index, int, sqliteTable, text, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import { user } from "../auth/schema";
import { layouts } from "./schema";

export const layoutCheckpoints = sqliteTable(
  "layout_checkpoints",
  {
    id: int().primaryKey({ autoIncrement: true }),
    layoutId: int("layout_id")
      .notNull()
      .references((): AnySQLiteColumn => layouts.id, { onDelete: "cascade" }),
    kind: text().notNull().$type<"auto-publish" | "manual" | "auto-draft">(),
    label: text(),
    snapshot: text().notNull(),
    schemaVersion: int("schema_version").notNull(),
    createdAt: int("created_at").notNull(),
    createdBy: text("created_by").references(() => user.id),
  },
  (table) => [index("layout_checkpoints_layout_created_idx").on(table.layoutId, table.createdAt)],
);
