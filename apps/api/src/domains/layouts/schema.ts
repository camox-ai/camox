import { index, int, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { environments, projects } from "../projects/schema";

export const layouts = sqliteTable(
  "layouts",
  {
    id: int().primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id),
    environmentId: int("environment_id")
      .notNull()
      .references(() => environments.id),
    layoutId: text("layout_id").notNull(),
    description: text(),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    index("layouts_project_idx").on(table.projectId),
    index("layouts_project_layout_idx").on(table.projectId, table.layoutId),
    index("layouts_environment_layout_idx").on(table.environmentId, table.layoutId),
  ],
);
