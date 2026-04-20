import { os, ORPCError } from "@orpc/server";

import type { Database } from "./db";
import type { Auth } from "./routes/auth";
import type { Bindings } from "./types";

// --- Context types ---

export type BaseContext = {
  db: Database;
  user: Auth["$Infer"]["Session"]["user"] | null;
  session: Auth["$Infer"]["Session"]["session"] | null;
  env: Bindings;
  headers: Headers;
  environmentName: string;
  waitUntil: (promise: Promise<unknown>) => void;
};

export type AuthedContext = BaseContext & {
  user: Auth["$Infer"]["Session"]["user"];
  session: Auth["$Infer"]["Session"]["session"];
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

/** Authed procedure — requires authenticated user */
export const authed = pub.use(async ({ context, next }) => {
  if (!context.user || !context.session) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return next({
    context: {
      ...context,
      user: context.user,
      session: context.session,
    },
  });
});
