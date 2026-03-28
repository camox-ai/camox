import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { int, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../types";

// --- Schema ---

export const projects = sqliteTable(
  "projects",
  {
    id: int().primaryKey({ autoIncrement: true }),
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    domain: text().notNull(),
    organizationSlug: text("organization_slug").notNull(),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("projects_slug_idx").on(table.slug),
    index("projects_domain_idx").on(table.domain),
    index("projects_organization_idx").on(table.organizationSlug),
  ],
);

// --- Routes ---

const createProjectSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().optional(),
  domain: z.string(),
  organizationSlug: z.string(),
});

const updateProjectSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  domain: z.string(),
});

export const projectRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const result = await c.var.db.select().from(projects);
    return c.json(result);
  })
  .get("/first", async (c) => {
    const result = await c.var.db.select().from(projects).limit(1).get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .get("/by-slug/:slug", async (c) => {
    const result = await c.var.db
      .select()
      .from(projects)
      .where(eq(projects.slug, c.req.param("slug")))
      .get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .get("/:id{[0-9]+}", async (c) => {
    const result = await c.var.db
      .select()
      .from(projects)
      .where(eq(projects.id, Number(c.req.param("id"))))
      .get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .post("/", zValidator("json", createProjectSchema), async (c) => {
    const body = c.req.valid("json");
    const now = Date.now();
    const result = await c.var.db
      .insert(projects)
      .values({ ...body, createdAt: now, updatedAt: now })
      .returning()
      .get();
    return c.json(result, 201);
  })
  .patch("/:id{[0-9]+}", zValidator("json", updateProjectSchema), async (c) => {
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");
    const result = await c.var.db
      .update(projects)
      .set({ ...body, updatedAt: Date.now() })
      .where(eq(projects.id, id))
      .returning()
      .get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .delete("/:id{[0-9]+}", async (c) => {
    const id = Number(c.req.param("id"));
    const result = await c.var.db.delete(projects).where(eq(projects.id, id)).returning().get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  });
