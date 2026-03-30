import { Hono } from "hono";
import { cors } from "hono/cors";

import { createDb } from "./db";
export { AiJobScheduler } from "./durable-objects/ai-job-scheduler";
import { authRoutes, createAuth } from "./features/auth";
import { blockDefinitionRoutes } from "./features/block-definitions";
import { blockRoutes } from "./features/blocks";
import { fileRoutes } from "./features/files";
import { layoutRoutes } from "./features/layouts";
import { pageRoutes } from "./features/pages";
import { projectRoutes } from "./features/projects";
import { repeatableItemRoutes } from "./features/repeatable-items";
import { seedRoutes } from "./features/seed";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>()
  // Inject db into every request
  .use("*", async (c, next) => {
    c.set("db", createDb(c.env.DB));
    await next();
  })
  // CORS for all routes — accepts any origin (Camox sites run on arbitrary domains)
  .use(
    "*",
    cors({
      origin: (origin) => origin,
      allowHeaders: ["Content-Type", "Authorization", "Better-Auth-Cookie"],
      allowMethods: ["POST", "GET", "OPTIONS"],
      exposeHeaders: ["Content-Length", "Set-Better-Auth-Cookie"],
      maxAge: 600,
      credentials: true,
    }),
  )
  // Auth routes (unauthenticated)
  .route("/api/auth", authRoutes)
  // Seed route (dev only, unauthenticated)
  .route("/seed", seedRoutes)
  // Session middleware — populates c.var.user/session for all subsequent routes
  .use("*", async (c, next) => {
    const auth = createAuth(c.var.db, c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
      c.set("user", null);
      c.set("session", null);
      await next();
      return;
    }

    c.set("user", session.user);
    c.set("session", session.session);
    await next();
  })
  .route("/projects", projectRoutes)
  .route("/pages", pageRoutes)
  .route("/blocks", blockRoutes)
  .route("/layouts", layoutRoutes)
  .route("/files", fileRoutes)
  .route("/repeatableItems", repeatableItemRoutes)
  .route("/blockDefinitions", blockDefinitionRoutes);

export type AppType = typeof app;
export default app;
