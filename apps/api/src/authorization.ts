import { ORPCError } from "@orpc/server";
import { and, eq, or } from "drizzle-orm";

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

// --- Sync Secret ---

export async function assertSyncSecret(db: Database, projectSlug: string, syncSecret: string) {
  const project = await db.select().from(projects).where(eq(projects.slug, projectSlug)).get();
  if (!project) throw new ORPCError("NOT_FOUND");

  if (syncSecret !== project.syncSecret) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return project;
}

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

/** Verify user is a member of the org that owns a project (by project ID). */
async function assertProjectMembership(db: Database, projectId: number, userId: string) {
  const result = await db
    .select({ id: member.id })
    .from(projects)
    .innerJoin(organizationTable, eq(organizationTable.slug, projects.organizationSlug))
    .innerJoin(
      member,
      and(eq(member.organizationId, organizationTable.id), eq(member.userId, userId)),
    )
    .where(eq(projects.id, projectId))
    .get();
  if (!result) throw new ORPCError("FORBIDDEN");
}

// --- Authorization Helpers ---

export async function getAuthorizedProject(db: Database, projectId: number, userId: string) {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return null;
  await assertProjectMembership(db, projectId, userId);
  return project;
}

export async function getAuthorizedProjectBySlug(db: Database, slug: string, userId: string) {
  const project = await db.select().from(projects).where(eq(projects.slug, slug)).get();
  if (!project) return null;
  await assertProjectMembership(db, project.id, userId);
  return project;
}

export async function assertPageAccess(db: Database, pageId: number, userId: string) {
  const result = await db
    .select({ page: pages, projectId: projects.id })
    .from(pages)
    .innerJoin(projects, eq(projects.id, pages.projectId))
    .where(eq(pages.id, pageId))
    .get();
  if (!result) return null;
  await assertProjectMembership(db, result.projectId, userId);
  return result;
}

export async function assertBlockAccess(db: Database, blockId: number, userId: string) {
  const result = await db
    .select({ block: blocks, projectId: projects.id, pagePath: pages.fullPath })
    .from(blocks)
    .leftJoin(pages, eq(blocks.pageId, pages.id))
    .leftJoin(layouts, eq(blocks.layoutId, layouts.id))
    .innerJoin(projects, or(eq(projects.id, pages.projectId), eq(projects.id, layouts.projectId)))
    .where(eq(blocks.id, blockId))
    .get();
  if (!result) return null;
  await assertProjectMembership(db, result.projectId, userId);
  return result;
}

export async function assertRepeatableItemAccess(db: Database, itemId: number, userId: string) {
  const result = await db
    .select({ item: repeatableItems, projectId: projects.id, pagePath: pages.fullPath })
    .from(repeatableItems)
    .innerJoin(blocks, eq(repeatableItems.blockId, blocks.id))
    .leftJoin(pages, eq(blocks.pageId, pages.id))
    .leftJoin(layouts, eq(blocks.layoutId, layouts.id))
    .innerJoin(projects, or(eq(projects.id, pages.projectId), eq(projects.id, layouts.projectId)))
    .where(eq(repeatableItems.id, itemId))
    .get();
  if (!result) return null;
  await assertProjectMembership(db, result.projectId, userId);
  return result;
}

export async function assertFileAccess(db: Database, fileId: number, userId: string) {
  const result = await db
    .select({ file: files })
    .from(files)
    .innerJoin(projects, eq(projects.id, files.projectId))
    .where(eq(files.id, fileId))
    .get();
  if (!result) return null;
  await assertProjectMembership(db, result.file.projectId!, userId);
  return result;
}
