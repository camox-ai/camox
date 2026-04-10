import fs from "node:fs";
import path from "node:path";

import { createClient } from "@libsql/client";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { generateKeyBetween } from "fractional-indexing";

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
  const files = fs.readdirSync(d1Dir).filter((f) => f.endsWith(".sqlite"));
  return files.length > 0 ? path.join(d1Dir, files[0]) : "";
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
// Seed auth (user, org, membership)
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

async function seedAuth(db: ReturnType<typeof createDrizzle>) {
  // Minimal better-auth instance — no hooks, no social providers
  const auth = betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
    secret: "dev-seed-secret",
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

  return { userId, orgId };
}

// ---------------------------------------------------------------------------
// Seed content (project, environment, layout, pages, blocks, files)
// ---------------------------------------------------------------------------

async function seedContent(db: ReturnType<typeof createDrizzle>) {
  const now = Date.now();

  // Project
  const project = await db
    .insert(projects)
    .values({
      name: "Camox Playground",
      slug: "camox-playground-01",
      organizationSlug: "camox-demo",
      syncSecret: "camox-dev-sync-secret",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // Production environment
  const environment = await db
    .insert(environments)
    .values({
      projectId: project.id,
      name: "production",
      type: "production",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // Layout
  const layout = await db
    .insert(layouts)
    .values({
      projectId: project.id,
      environmentId: environment.id,
      layoutId: "landing-page",
      description: "Landing page layout with navbar and footer",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // Layout blocks (navbar + footer)
  const navbarPos = generateKeyBetween(null, null);
  const footerPos = generateKeyBetween(navbarPos, null);

  const navbarBlock = await db
    .insert(blocks)
    .values({
      layoutId: layout.id,
      type: "navbar",
      content: {
        title: { text: "Acme", href: "/", newTab: false },
        cta: { text: "Get Started", href: "/get-started", newTab: false },
      },
      settings: { floating: true },
      placement: "before" as const,
      summary: "Floating navbar with Acme title and Get Started CTA",
      position: navbarPos,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  const footerBlock = await db
    .insert(blocks)
    .values({
      layoutId: layout.id,
      type: "footer",
      content: { title: "Acme" },
      placement: "after" as const,
      summary: "Footer with Acme title",
      position: footerPos,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // Navbar repeatable items: links
  await db.insert(repeatableItems).values([
    {
      blockId: navbarBlock.id,
      fieldName: "links",
      content: { link: { text: "Features", href: "/features", newTab: false } },
      summary: "Features link",
      position: generateKeyBetween(null, null),
      createdAt: now,
      updatedAt: now,
    },
    {
      blockId: navbarBlock.id,
      fieldName: "links",
      content: { link: { text: "Pricing", href: "/pricing", newTab: false } },
      summary: "Pricing link",
      position: generateKeyBetween(generateKeyBetween(null, null), null),
      createdAt: now,
      updatedAt: now,
    },
    {
      blockId: navbarBlock.id,
      fieldName: "links",
      content: { link: { text: "Docs", href: "/docs", newTab: false } },
      summary: "Docs link",
      position: generateKeyBetween(generateKeyBetween(generateKeyBetween(null, null), null), null),
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // Footer repeatable items: columns with nested links
  const colPos0 = generateKeyBetween(null, null);
  const colPos1 = generateKeyBetween(colPos0, null);

  const footerColumns = await db
    .insert(repeatableItems)
    .values([
      {
        blockId: footerBlock.id,
        fieldName: "columns",
        content: { title: "Product" },
        summary: "Product column",
        position: colPos0,
        createdAt: now,
        updatedAt: now,
      },
      {
        blockId: footerBlock.id,
        fieldName: "columns",
        content: { title: "Company" },
        summary: "Company column",
        position: colPos1,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .returning();

  // Nested links for Product column
  const productLinkPos0 = generateKeyBetween(null, null);
  const productLinkPos1 = generateKeyBetween(productLinkPos0, null);
  await db.insert(repeatableItems).values([
    {
      blockId: footerBlock.id,
      parentItemId: footerColumns[0].id,
      fieldName: "links",
      content: { link: { text: "Features", href: "/features", newTab: false } },
      summary: "Features link",
      position: productLinkPos0,
      createdAt: now,
      updatedAt: now,
    },
    {
      blockId: footerBlock.id,
      parentItemId: footerColumns[0].id,
      fieldName: "links",
      content: { link: { text: "Pricing", href: "/pricing", newTab: false } },
      summary: "Pricing link",
      position: productLinkPos1,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // Nested links for Company column
  const companyLinkPos0 = generateKeyBetween(null, null);
  const companyLinkPos1 = generateKeyBetween(companyLinkPos0, null);
  await db.insert(repeatableItems).values([
    {
      blockId: footerBlock.id,
      parentItemId: footerColumns[1].id,
      fieldName: "links",
      content: { link: { text: "About", href: "/about", newTab: false } },
      summary: "About link",
      position: companyLinkPos0,
      createdAt: now,
      updatedAt: now,
    },
    {
      blockId: footerBlock.id,
      parentItemId: footerColumns[1].id,
      fieldName: "links",
      content: { link: { text: "Blog", href: "/blog", newTab: false } },
      summary: "Blog link",
      position: companyLinkPos1,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // Homepage
  const page = await db
    .insert(pages)
    .values({
      projectId: project.id,
      environmentId: environment.id,
      pathSegment: "",
      fullPath: "/",
      layoutId: layout.id,
      metaTitle: "The website framework for agents",
      metaDescription:
        "Meet Camox, the web toolkit designed for developers, LLMs and content editors.",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // Seed a demo file for image fields
  const demoFile = await db
    .insert(files)
    .values({
      projectId: project.id,
      environmentId: environment.id,
      url: "https://placehold.co/1200x800/18181b/fafafa.png?text=Demo+Image",
      alt: "Demo placeholder image",
      filename: "demo-image",
      mimeType: "image/png",
      size: 0,
      blobId: "seed/demo-image.png",
      path: "seed/demo-image.png",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // Page blocks
  const heroPos = generateKeyBetween(null, null);
  const statsPos = generateKeyBetween(heroPos, null);

  await db.insert(blocks).values({
    pageId: page.id,
    type: "hero",
    content: {
      title: "Websites you'll love to maintain",
      description: "Meet Camox, the web toolkit designed for developers, LLMs and content editors.",
      cta: { text: "Start building", href: "/get-started", newTab: false },
      illustration: { _fileId: demoFile.id },
    },
    summary: "Hero section with title, description and CTA",
    position: heroPos,
    createdAt: now,
    updatedAt: now,
  });

  const statsBlock = await db
    .insert(blocks)
    .values({
      pageId: page.id,
      type: "statistics",
      content: {
        title: "Platform performance",
        subtitle: "Built for modern web development",
        description:
          "Camox combines the power of a headless CMS with the developer experience of a modern framework.",
      },
      summary: "Statistics section with 4 stats",
      position: statsPos,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  // Repeatable items for statistics block
  const stats = [
    { number: "100M+", label: "pages served monthly across all projects." },
    { number: "99.9%", label: "uptime with global CDN infrastructure." },
    { number: "50+", label: "countries served worldwide." },
    { number: "10ms", label: "average response time for content delivery." },
  ];

  let prevPos: string | null = null;
  for (const stat of stats) {
    const pos = generateKeyBetween(prevPos, null);
    await db.insert(repeatableItems).values({
      blockId: statsBlock.id,
      fieldName: "statistics",
      content: { number: stat.number, label: stat.label },
      summary: `${stat.number} ${stat.label}`,
      position: pos,
      createdAt: now,
      updatedAt: now,
    });
    prevPos = pos;
  }

  return { projectId: project.id, pageId: page.id };
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
  await seedAuth(db);
  const { projectId, pageId } = await seedContent(db);

  console.log("Seeded successfully!");
  console.log("Credentials: dev@camox.dev / camox-dev-123");
  console.log("Project ID:", projectId);
  console.log("Page ID:", pageId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
