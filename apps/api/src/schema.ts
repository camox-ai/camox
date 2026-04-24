import {
  int,
  sqliteTable,
  text,
  index,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

// --- Auth (column names use camelCase to match better-auth's internal field names) ---

export const user = sqliteTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: int("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text(),
  createdAt: int("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text().primaryKey(),
  expiresAt: int("expiresAt", { mode: "timestamp_ms" }).notNull(),
  token: text().notNull().unique(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  activeOrganizationId: text("activeOrganizationId"),
  createdAt: int("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const account = sqliteTable("account", {
  id: text().primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: int("accessTokenExpiresAt", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: int("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
  scope: text(),
  password: text(),
  createdAt: int("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: int("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: int("createdAt", { mode: "timestamp_ms" }),
  updatedAt: int("updatedAt", { mode: "timestamp_ms" }),
});

export const organizationTable = sqliteTable("organization", {
  id: text().primaryKey(),
  name: text().notNull(),
  slug: text().unique(),
  logo: text(),
  metadata: text(),
  createdAt: int("createdAt", { mode: "timestamp_ms" }).notNull(),
});

export const member = sqliteTable("member", {
  id: text().primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organizationTable.id),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  role: text().notNull().default("member"),
  createdAt: int("createdAt", { mode: "timestamp_ms" }).notNull(),
});

export const invitation = sqliteTable("invitation", {
  id: text().primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organizationTable.id),
  email: text().notNull(),
  role: text(),
  status: text().notNull().default("pending"),
  expiresAt: int("expiresAt", { mode: "timestamp_ms" }).notNull(),
  inviterId: text("inviterId")
    .notNull()
    .references(() => user.id),
});

// --- Projects ---

export const projects = sqliteTable(
  "projects",
  {
    id: int().primaryKey({ autoIncrement: true }),
    slug: text().notNull(),
    name: text().notNull(),
    syncSecret: text("sync_secret").notNull().default(""),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("projects_slug_idx").on(table.slug),
    index("projects_organization_idx").on(table.organizationId),
  ],
);

// --- Environments ---

export const environments = sqliteTable(
  "environments",
  {
    id: int().primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id),
    name: text().notNull(),
    type: text().notNull().$type<"production" | "development">(),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("environments_project_name_idx").on(table.projectId, table.name),
    index("environments_project_idx").on(table.projectId),
  ],
);

// --- Layouts ---

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

// --- Pages ---

export const pages = sqliteTable(
  "pages",
  {
    id: int().primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id),
    environmentId: int("environment_id")
      .notNull()
      .references(() => environments.id),
    pathSegment: text("path_segment").notNull(),
    fullPath: text("full_path").notNull(),
    parentPageId: int("parent_page_id"),
    layoutId: int("layout_id")
      .notNull()
      .references(() => layouts.id),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    aiSeoEnabled: int("ai_seo_enabled", { mode: "boolean" }),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    index("pages_full_path_idx").on(table.fullPath),
    index("pages_parent_idx").on(table.parentPageId),
    index("pages_project_idx").on(table.projectId),
    index("pages_environment_full_path_idx").on(table.environmentId, table.fullPath),
  ],
);

// --- Block Definitions ---

export const blockDefinitions = sqliteTable(
  "block_definitions",
  {
    id: int().primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id),
    environmentId: int("environment_id")
      .notNull()
      .references(() => environments.id),
    blockId: text("block_id").notNull(),
    title: text().notNull(),
    description: text().notNull(),
    contentSchema: text("content_schema", { mode: "json" }).notNull(),
    settingsSchema: text("settings_schema", { mode: "json" }),
    defaultContent: text("default_content", { mode: "json" }),
    defaultSettings: text("default_settings", { mode: "json" }),
    layoutOnly: int("layout_only", { mode: "boolean" }),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    index("block_definitions_project_idx").on(table.projectId),
    index("block_definitions_project_block_idx").on(table.projectId, table.blockId),
    index("block_definitions_environment_block_idx").on(table.environmentId, table.blockId),
  ],
);

// --- Blocks ---

export const blocks = sqliteTable(
  "blocks",
  {
    id: int().primaryKey({ autoIncrement: true }),
    pageId: int("page_id").references(() => pages.id),
    layoutId: int("layout_id").references(() => layouts.id, { onDelete: "cascade" }),
    type: text().notNull(),
    content: text({ mode: "json" }).notNull(),
    settings: text({ mode: "json" }),
    placement: text().$type<"before" | "after">(),
    summary: text().notNull().default(""),
    position: text().notNull(),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    index("blocks_page_idx").on(table.pageId),
    index("blocks_layout_idx").on(table.layoutId),
    index("blocks_type_idx").on(table.type),
  ],
);

// --- Repeatable Items ---

export const repeatableItems = sqliteTable(
  "repeatable_items",
  {
    id: int().primaryKey({ autoIncrement: true }),
    blockId: int("block_id")
      .notNull()
      .references(() => blocks.id, { onDelete: "cascade" }),
    parentItemId: int("parent_item_id").references((): AnySQLiteColumn => repeatableItems.id, {
      onDelete: "cascade",
    }),
    fieldName: text("field_name").notNull(),
    content: text({ mode: "json" }).notNull(),
    settings: text({ mode: "json" }),
    summary: text().notNull().default(""),
    position: text().notNull(),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    index("repeatable_items_block_field_idx").on(table.blockId, table.fieldName),
    index("repeatable_items_block_idx").on(table.blockId),
    index("repeatable_items_parent_idx").on(table.parentItemId),
  ],
);

// --- Files ---

export const files = sqliteTable(
  "files",
  {
    id: int().primaryKey({ autoIncrement: true }),
    projectId: int("project_id").references(() => projects.id),
    environmentId: int("environment_id")
      .notNull()
      .references(() => environments.id),
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
    index("files_environment_idx").on(table.environmentId),
  ],
);

// --- AI Jobs ---

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
