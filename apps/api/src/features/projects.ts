import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { int, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import { z } from "zod";

import { getAuthorizedProject, requireOrg } from "../authorization";
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
  // Public routes (no auth required)
  .get("/list", async (c) => {
    const result = await c.var.db.select().from(projects);
    return c.json(result);
  })
  .get("/getFirst", async (c) => {
    const result = await c.var.db.select().from(projects).limit(1).get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .get("/getBySlug", zValidator("query", z.object({ slug: z.string() })), async (c) => {
    const { slug } = c.req.valid("query");
    const result = await c.var.db.select().from(projects).where(eq(projects.slug, slug)).get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  .get("/get", zValidator("query", z.object({ id: z.coerce.number() })), async (c) => {
    const { id } = c.req.valid("query");
    const result = await c.var.db.select().from(projects).where(eq(projects.id, id)).get();
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json(result);
  })
  // Protected routes
  .use(requireOrg)
  .post("/create", zValidator("json", createProjectSchema), async (c) => {
    const orgSlug = c.var.orgSlug!;
    const body = c.req.valid("json");
    if (body.organizationSlug !== orgSlug) {
      return c.json({ error: "Not found" }, 404);
    }
    const now = Date.now();
    const result = await c.var.db
      .insert(projects)
      .values({ ...body, createdAt: now, updatedAt: now })
      .returning()
      .get();
    return c.json(result, 201);
  })
  .post(
    "/update",
    zValidator("json", updateProjectSchema.extend({ id: z.number() })),
    async (c) => {
      const orgSlug = c.var.orgSlug!;
      const { id, ...body } = c.req.valid("json");
      const project = await getAuthorizedProject(c.var.db, id, orgSlug);
      if (!project) return c.json({ error: "Not found" }, 404);
      const result = await c.var.db
        .update(projects)
        .set({ ...body, updatedAt: Date.now() })
        .where(eq(projects.id, id))
        .returning()
        .get();
      return c.json(result);
    },
  )
  .post("/delete", zValidator("json", z.object({ id: z.number() })), async (c) => {
    const orgSlug = c.var.orgSlug!;
    const { id } = c.req.valid("json");
    const project = await getAuthorizedProject(c.var.db, id, orgSlug);
    if (!project) return c.json({ error: "Not found" }, 404);
    const result = await c.var.db.delete(projects).where(eq(projects.id, id)).returning().get();
    return c.json(result);
  });
