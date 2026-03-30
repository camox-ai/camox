import { Hono } from "hono";
import { partyserverMiddleware } from "hono-party";
import { cors } from "hono/cors";

import { requireOrg } from "./authorization";
import { createDb } from "./db";
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

// ---------------------------------------------------------------------------
// Middleware (registered via app.use, not chained, to keep .route() chain
// clean for RPC type inference)
// ---------------------------------------------------------------------------

const app = new Hono<AppEnv>();

// Inject db into every request
app.use("*", async (c, next) => {
  c.set("db", createDb(c.env.DB));
  await next();
});

// CORS — accepts any origin (Camox sites run on arbitrary domains)
app.use(
  "*",
  cors({
    origin: (origin) => origin,
    allowHeaders: ["Content-Type", "Authorization", "Better-Auth-Cookie"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length", "Set-Better-Auth-Cookie"],
    maxAge: 600,
    credentials: true,
  }),
);

// Session middleware — populates c.var.user/session
app.use("*", async (c, next) => {
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
});

// PartyServer — intercepts WebSocket upgrade requests for real-time invalidation
app.use(
  "*",
  partyserverMiddleware<AppEnv>({
    options: {
      onBeforeConnect: async (req, _lobby, c) => {
        const db = createDb(c.env.DB);
        const auth = createAuth(db, c.env);
        const session = await auth.api.getSession({ headers: req.headers });
        if (!session) return new Response("Unauthorized", { status: 401 });
      },
    },
  }),
);

// ---------------------------------------------------------------------------
// Routes (chained for Hono RPC type inference)
// ---------------------------------------------------------------------------

// Org auth for all POST routes except auth/seed (applied here instead of
// inside sub-routers — createMiddleware as inline route middleware causes
// 404s in workerd)
const UNPROTECTED = ["/api/auth/", "/seed"];
app.use("*", async (c, next) => {
  if (c.req.method !== "POST") return next();
  if (UNPROTECTED.some((p) => c.req.path.startsWith(p))) return next();
  return requireOrg(c, next);
});

// Mount all sub-routes onto app via .route()
const routes = app
  .route("/api/auth", authRoutes)
  .route("/seed", seedRoutes)
  .route("/projects", projectRoutes)
  .route("/pages", pageRoutes)
  .route("/blocks", blockRoutes)
  .route("/layouts", layoutRoutes)
  .route("/files", fileRoutes)
  .route("/repeatableItems", repeatableItemRoutes)
  .route("/blockDefinitions", blockDefinitionRoutes);

export type AppType = typeof routes;
export default app;
