import { ORPCError } from "@orpc/server";
import { and, eq, or } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import type { Database } from "./db";
import {
  member,
  organizationTable,
  blocks,
  files,
  layouts,
  pages,
  projects,
  repeatableItems,
} from "./schema";
import type { AppEnv } from "./types";

// --- Middleware ---

export const requireOrg = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Try activeOrganizationId first, fall back to the user's sole membership
  const activeOrgId = c.var.session?.activeOrganizationId;

  const result = activeOrgId
    ? await c.var.db
        .select({ slug: organizationTable.slug })
        .from(member)
        .innerJoin(organizationTable, eq(organizationTable.id, member.organizationId))
        .where(and(eq(member.organizationId, activeOrgId), eq(member.userId, c.var.user.id)))
        .get()
    : await c.var.db
        .select({ slug: organizationTable.slug })
        .from(member)
        .innerJoin(organizationTable, eq(organizationTable.id, member.organizationId))
        .where(eq(member.userId, c.var.user.id))
        .get();

  if (!result?.slug) {
    return c.json({ error: "Forbidden" }, 403);
  }

  c.set("orgSlug", result.slug);
  await next();
});

// --- Membership Helpers ---

export async function assertOrgMembership(db: Database, userId: string, orgSlug: string) {
  const result = await db
    .select({ id: member.id })
    .from(member)
    .innerJoin(organizationTable, eq(organizationTable.id, member.organizationId))
    .where(and(eq(organizationTable.slug, orgSlug), eq(member.userId, userId)))
    .get();
  if (!result) throw new ORPCError("FORBIDDEN");
}

// --- Authorization Helpers ---

export async function getAuthorizedProject(db: Database, projectId: number, orgSlug: string) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationSlug, orgSlug)))
    .get();
}

export async function getAuthorizedProjectBySlug(db: Database, slug: string, orgSlug: string) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.slug, slug), eq(projects.organizationSlug, orgSlug)))
    .get();
}

export async function assertPageAccess(db: Database, pageId: number, orgSlug: string) {
  return db
    .select({ page: pages })
    .from(pages)
    .innerJoin(projects, eq(projects.id, pages.projectId))
    .where(and(eq(pages.id, pageId), eq(projects.organizationSlug, orgSlug)))
    .get();
}

export async function assertBlockAccess(db: Database, blockId: number, orgSlug: string) {
  return db
    .select({ block: blocks, projectId: projects.id, pagePath: pages.fullPath })
    .from(blocks)
    .leftJoin(pages, eq(blocks.pageId, pages.id))
    .leftJoin(layouts, eq(blocks.layoutId, layouts.id))
    .innerJoin(projects, or(eq(projects.id, pages.projectId), eq(projects.id, layouts.projectId)))
    .where(and(eq(blocks.id, blockId), eq(projects.organizationSlug, orgSlug)))
    .get();
}

export async function assertRepeatableItemAccess(db: Database, itemId: number, orgSlug: string) {
  return db
    .select({ item: repeatableItems, projectId: projects.id, pagePath: pages.fullPath })
    .from(repeatableItems)
    .innerJoin(blocks, eq(repeatableItems.blockId, blocks.id))
    .leftJoin(pages, eq(blocks.pageId, pages.id))
    .leftJoin(layouts, eq(blocks.layoutId, layouts.id))
    .innerJoin(projects, or(eq(projects.id, pages.projectId), eq(projects.id, layouts.projectId)))
    .where(and(eq(repeatableItems.id, itemId), eq(projects.organizationSlug, orgSlug)))
    .get();
}

export async function assertFileAccess(db: Database, fileId: number, orgSlug: string) {
  return db
    .select({ file: files })
    .from(files)
    .innerJoin(projects, eq(projects.id, files.projectId))
    .where(and(eq(files.id, fileId), eq(projects.organizationSlug, orgSlug)))
    .get();
}
