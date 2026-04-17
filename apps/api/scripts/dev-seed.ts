import fs from "node:fs";
import path from "node:path";

import { createClient } from "@libsql/client";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";

import {
  account,
  blockDefinitions,
  blocks,
  environments,
  files,
  invitation,
  layouts,
  member,
  organizationTable,
  pages,
  projects,
  repeatableItems,
  session,
  user,
  verification,
} from "../src/schema";

// ---------------------------------------------------------------------------
// Locate local D1 SQLite file (same logic as drizzle.config.ts)
// ---------------------------------------------------------------------------

function getLocalD1Db(): string {
  const d1Dir = path.resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  if (!fs.existsSync(d1Dir)) return "";
  const dbFiles = fs.readdirSync(d1Dir).filter((f) => f.endsWith(".sqlite"));
  return dbFiles.length > 0 ? path.join(d1Dir, dbFiles[0]) : "";
}

// ---------------------------------------------------------------------------
// Clear all tables in FK-safe order
// ---------------------------------------------------------------------------

async function clearAll(db: ReturnType<typeof createDrizzle>) {
  await db.delete(repeatableItems).run();
  await db.delete(blocks).run();
  await db.delete(pages).run();
  await db.delete(layouts).run();
  await db.delete(blockDefinitions).run();
  await db.delete(files).run();
  await db.delete(environments).run();
  await db.delete(projects).run();
  await db.run(sql`DELETE FROM member`);
  await db.run(sql`DELETE FROM invitation`);
  await db.run(sql`DELETE FROM session`);
  await db.run(sql`DELETE FROM account`);
  await db.run(sql`DELETE FROM organization`);
  await db.run(sql`DELETE FROM verification`);
  await db.run(sql`DELETE FROM user`);
}

// ---------------------------------------------------------------------------
// Seed auth (user, org, membership) + project skeleton
// ---------------------------------------------------------------------------

const authSchema = {
  user,
  session,
  account,
  verification,
  organization: organizationTable,
  member,
  invitation,
};

function createDrizzle(sqlitePath: string) {
  const client = createClient({ url: `file:${sqlitePath}` });
  return drizzle(client, {
    schema: {
      user,
      session,
      account,
      verification,
      organizationTable,
      member,
      invitation,
      projects,
      environments,
      layouts,
      pages,
      blocks,
      blockDefinitions,
      files,
      repeatableItems,
    },
  });
}

async function seed(db: ReturnType<typeof createDrizzle>) {
  // Minimal better-auth instance — no hooks, no social providers
  const auth = betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: "http://localhost:8787",
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    plugins: [organization()],
  });

  const signUpResponse = await auth.api.signUpEmail({
    body: { name: "Dev User", email: "dev@camox.dev", password: "camox-dev-123" },
  });

  const userId = signUpResponse.user.id;

  const orgId = crypto.randomUUID();
  await db.insert(organizationTable).values({
    id: orgId,
    name: "Camox Demo",
    slug: "camox-demo",
    createdAt: new Date(),
  });

  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt: new Date(),
  });

  const now = Date.now();

  const project = await db
    .insert(projects)
    .values({
      name: "Camox Playground",
      slug: "camox-playground-01",
      organizationId: orgId,
      syncSecret: "camox-dev-sync-secret",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  await db.insert(environments).values({
    projectId: project.id,
    name: "production",
    type: "production",
    createdAt: now,
    updatedAt: now,
  });

  return { projectId: project.id };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const sqlitePath = getLocalD1Db();
  if (!sqlitePath) {
    console.error("No local D1 database found. Run 'pnpm db:migrate:local' first.");
    process.exit(1);
  }

  const db = createDrizzle(sqlitePath);

  await clearAll(db);
  const { projectId } = await seed(db);

  console.info("Seeded successfully!");
  console.info("Credentials: dev@camox.dev / camox-dev-123");
  console.info("Project ID:", projectId);
  console.info("Site content will be initialized on first 'pnpm dev' via Vite plugin sync.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
