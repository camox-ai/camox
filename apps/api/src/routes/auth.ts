import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, oneTimeToken, organization } from "better-auth/plugins";
import { Hono } from "hono";

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

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${base}-${suffix}`;
}

export function createAuth(db: Database, env: Bindings, baseURL: string) {
  // Derive the cookie domain from SITE_URL so cookies are shared between
  // the web app (camox.ai) and the API (api.camox.ai).
  // In dev (localhost), this is undefined — cookies work without an explicit domain.
  let cookieDomain: string | undefined;
  try {
    const siteHost = new URL(env.SITE_URL).hostname;
    if (siteHost !== "localhost") cookieDomain = `.${siteHost}`;
  } catch {
    // SITE_URL missing or malformed — fall back to default cookie domain
  }

  const auth = betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: authSchema,
    }),
    baseURL,
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
    session: {
      expiresIn: 60 * 60 * 24 * 90, // 90 days
      updateAge: 60 * 60 * 24, // refresh session expiry daily
    },
    // Accept requests from any origin — Camox sites run on arbitrary customer domains
    trustedOrigins: ["*"],
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
        domain: cookieDomain,
      },
    },
    plugins: [organization(), crossDomain({ siteUrl: env.SITE_URL }), oneTimeToken(), bearer()],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const orgName = `${user.name}'s team`;
            const slug = generateSlug(orgName);
            await auth.api.createOrganization({
              body: {
                name: orgName,
                slug,
                userId: user.id,
              },
            });
          },
        },
      },
    },
  });
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;

// --- Routes ---

export const authRoutes = new Hono<AppEnv>().on(["POST", "GET"], "/*", async (c) => {
  const url = new URL(c.req.url);
  const auth = createAuth(c.var.db, c.env, url.origin);
  return auth.handler(c.req.raw);
});
