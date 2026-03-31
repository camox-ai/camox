import { os, ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";

import type { Database } from "./db";
import { member, organizationTable, type Auth } from "./features/auth";
import type { Bindings } from "./types";

// --- Context types ---

export type BaseContext = {
  db: Database;
  user: Auth["$Infer"]["Session"]["user"] | null;
  session: Auth["$Infer"]["Session"]["session"] | null;
  env: Bindings;
};

export type AuthedContext = BaseContext & {
  user: Auth["$Infer"]["Session"]["user"];
  session: Auth["$Infer"]["Session"]["session"];
  orgSlug: string;
};

// --- Base procedures ---

/** Public procedure — available to anyone, no auth required */
export const pub = os.$context<BaseContext>().use(async ({ next, path }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof ORPCError && error.status < 500) {
      throw error;
    }
    console.error(`[oRPC] ${path.join(".")} →`, error);
    throw error;
  }
});

/** Authed procedure — requires authenticated user with org membership */
export const authed = pub.use(async ({ context, next }) => {
  if (!context.user || !context.session) {
    throw new ORPCError("UNAUTHORIZED");
  }

  const activeOrgId = context.session.activeOrganizationId;

  const result = activeOrgId
    ? await context.db
        .select({ slug: organizationTable.slug })
        .from(member)
        .innerJoin(organizationTable, eq(organizationTable.id, member.organizationId))
        .where(and(eq(member.organizationId, activeOrgId), eq(member.userId, context.user.id)))
        .get()
    : await context.db
        .select({ slug: organizationTable.slug })
        .from(member)
        .innerJoin(organizationTable, eq(organizationTable.id, member.organizationId))
        .where(eq(member.userId, context.user.id))
        .get();

  if (!result?.slug) {
    throw new ORPCError("FORBIDDEN");
  }

  return next({
    context: {
      ...context,
      user: context.user,
      session: context.session,
      orgSlug: result.slug,
    },
  });
});
