import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { partyserverMiddleware } from "hono-party";
import { cors } from "hono/cors";

import { createDb } from "./db";
import { router } from "./router";
import { authRoutes, createAuth } from "./routes/auth";
import { fileHonoRoutes } from "./routes/files";
import type { AppEnv } from "./types";

export type { Router } from "./router";

// ---------------------------------------------------------------------------
// Hono app + global middleware
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
    allowHeaders: ["Content-Type", "Authorization", "Better-Auth-Cookie", "x-environment-name"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length", "Set-Better-Auth-Cookie"],
    maxAge: 600,
    credentials: true,
  }),
);

// Session middleware — populates c.var.user/session
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const auth = createAuth(c.var.db, c.env, url.origin);
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", session?.user ?? null);
    c.set("session", session?.session ?? null);
  } catch (e) {
    console.error("Session lookup failed:", e);
    c.set("user", null);
    c.set("session", null);
  }
  await next();
});

// Environment name middleware — reads x-environment-name header, defaults to "production"
app.use("*", async (c, next) => {
  c.set("environmentName", c.req.header("x-environment-name") || "production");
  await next();
});

// PartyServer — intercepts WebSocket upgrade requests for real-time invalidation
app.use(
  "*",
  partyserverMiddleware<AppEnv>({
    options: {
      onBeforeConnect: async (req, _lobby, c) => {
        const db = createDb(c.env.DB);
        const url = new URL(req.url);
        const auth = createAuth(db, c.env, url.origin);

        // WebSocket upgrades can't carry custom headers, so the client
        // sends the cross-domain auth cookie as a query parameter instead.
        const headers = new Headers(req.headers);
        const authCookie = url.searchParams.get("_authCookie");
        if (authCookie) {
          headers.set("Better-Auth-Cookie", authCookie);
        }

        const session = await auth.api.getSession({ headers });
        if (!session) return new Response("Unauthorized", { status: 401 });
      },
    },
  }),
);

// ---------------------------------------------------------------------------
// Hono routes (auth, file upload/serve)
// ---------------------------------------------------------------------------

app.route("/api/auth", authRoutes);
app.route("/files", fileHonoRoutes);

// ---------------------------------------------------------------------------
// oRPC handler (all other API procedures)
// ---------------------------------------------------------------------------

const rpcHandler = new RPCHandler(router);

app.all("/rpc/*", async (c) => {
  const { matched, response } = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: {
      db: c.var.db,
      user: c.var.user,
      session: c.var.session,
      env: c.env,
      headers: c.req.raw.headers,
      environmentName: c.var.environmentName,
      waitUntil: (promise) => c.executionCtx.waitUntil(promise),
    },
  });

  if (matched) {
    return new Response(response.body, response);
  }

  return c.notFound();
});

// ---------------------------------------------------------------------------
// Error logging (development)
// ---------------------------------------------------------------------------

app.onError((err, c) => {
  console.error(`[${c.req.method}] ${c.req.path} →`, err);
  const origin = c.req.header("origin");
  if (origin) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
  }
  return c.json({ error: "Internal Server Error" }, 500);
});

export default app;
