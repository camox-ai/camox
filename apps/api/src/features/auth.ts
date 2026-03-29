import { crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oneTimeToken, organization } from "better-auth/plugins";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { Database } from "../db";
import type { AppEnv, Bindings } from "../types";

// --- Schema ---
// Column names use camelCase to match better-auth's internal field names.

export const user = sqliteTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: int("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text(),
  createdAt: int("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text().primaryKey(),
  expiresAt: int("expiresAt", { mode: "timestamp_ms" }).notNull(),
  token: text().notNull().unique(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  activeOrganizationId: text("activeOrganizationId"),
  createdAt: int("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const account = sqliteTable("account", {
  id: text().primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: int("accessTokenExpiresAt", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: int("refreshTokenExpiresAt", { mode: "timestamp_ms" }),
  scope: text(),
  password: text(),
  createdAt: int("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: int("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: int("expiresAt", { mode: "timestamp_ms" }).notNull(),
  createdAt: int("createdAt", { mode: "timestamp_ms" }),
  updatedAt: int("updatedAt", { mode: "timestamp_ms" }),
});

export const organizationTable = sqliteTable("organization", {
  id: text().primaryKey(),
  name: text().notNull(),
  slug: text().unique(),
  logo: text(),
  metadata: text(),
  createdAt: int("createdAt", { mode: "timestamp_ms" }).notNull(),
});

export const member = sqliteTable("member", {
  id: text().primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organizationTable.id),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  role: text().notNull().default("member"),
  createdAt: int("createdAt", { mode: "timestamp_ms" }).notNull(),
});

export const invitation = sqliteTable("invitation", {
  id: text().primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organizationTable.id),
  email: text().notNull(),
  role: text(),
  status: text().notNull().default("pending"),
  expiresAt: int("expiresAt", { mode: "timestamp_ms" }).notNull(),
  inviterId: text("inviterId")
    .notNull()
    .references(() => user.id),
});

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
    plugins: [organization(), crossDomain({ siteUrl: env.SITE_URL }), oneTimeToken()],
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
