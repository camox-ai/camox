import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";

import type { Database } from "../db";
import { environments } from "../schema";

export async function resolveEnvironment(
  db: Database,
  projectId: number,
  environmentName: string,
  options?: { autoCreate?: boolean },
) {
  let environment = await db
    .select()
    .from(environments)
    .where(and(eq(environments.projectId, projectId), eq(environments.name, environmentName)))
    .get();

  let created = false;

  if (!environment && options?.autoCreate) {
    const now = Date.now();
    environment = await db
      .insert(environments)
      .values({
        projectId,
        name: environmentName,
        type: "development",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    created = true;
  }

  if (!environment) {
    throw new ORPCError("NOT_FOUND", {
      message: `Environment "${environmentName}" not found`,
    });
  }
  return { ...environment, created };
}
