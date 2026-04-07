import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, oneTimeToken, organization } from "better-auth/plugins";
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Database } from "../db";
import { crossDomain } from "../lib/cross-domain";
import {
  user,
  session,
  account,
  verification,
  organizationTable,
  member,
  invitation,
} from "../schema";
import type { AppEnv, Bindings } from "../types";

// --- Auth Factory ---

const authSchema = {
  user,
  session,
  account,
  verification,
  organization: organizationTable,
  member,
  invitation,
};

export function createAuth(db: Database, env: Bindings) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: authSchema,
    }),
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    // Accept requests from any origin — Camox sites run on arbitrary customer domains
    trustedOrigins: ["*"],
    plugins: [organization(), crossDomain({ siteUrl: env.SITE_URL }), oneTimeToken(), bearer()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

// --- Routes ---

export const authRoutes = new Hono<AppEnv>()
  .use(
    "*",
    cors({
      origin: (origin) => origin,
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["POST", "GET", "OPTIONS"],
      exposeHeaders: ["Content-Length", "Set-Better-Auth-Cookie"],
      maxAge: 600,
      credentials: true,
    }),
  )
  .on(["POST", "GET"], "/*", async (c) => {
    const auth = createAuth(c.var.db, c.env);
    return auth.handler(c.req.raw);
  });
