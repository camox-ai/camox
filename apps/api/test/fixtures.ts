import { env } from "cloudflare:workers";

import { createDb } from "../src/db";
import type { ServiceContext } from "../src/domains/_shared/service-context";
import { environments, layouts, member, organizationTable, projects, user } from "../src/schema";
import type { Bindings } from "../src/types";

const now = 1_700_000_000_000;

export async function createProjectFixture(suffix: string) {
  const db = createDb(env.DB);
  const memberId = `member-${suffix}`;
  const outsiderId = `outsider-${suffix}`;
  const organizationId = `org-${suffix}`;

  const [memberUser, outsiderUser] = await db
    .insert(user)
    .values([
      {
        id: memberId,
        name: "Member",
        email: `member-${suffix}@example.com`,
        emailVerified: true,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
      {
        id: outsiderId,
        name: "Outsider",
        email: `outsider-${suffix}@example.com`,
        emailVerified: true,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
    ])
    .returning();
  await db.insert(organizationTable).values({
    id: organizationId,
    name: "Test organization",
    slug: `org-${suffix}`,
    createdAt: new Date(now),
  });
  await db.insert(member).values({
    id: `membership-${suffix}`,
    organizationId,
    userId: memberId,
    role: "owner",
    createdAt: new Date(now),
  });

  const project = await db
    .insert(projects)
    .values({
      slug: `project-${suffix}`,
      name: "Test project",
      deployToken: "test-deploy-token",
      organizationId,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
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
  const layout = await db
    .insert(layouts)
    .values({
      projectId: project.id,
      environmentId: environment.id,
      layoutId: "default",
      contentUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  return { db, environment, layout, memberUser, outsiderUser, project };
}

export function createServiceContext(
  db: ReturnType<typeof createDb>,
  selectedUser: ServiceContext["user"],
): ServiceContext {
  return {
    db,
    user: selectedUser,
    env: env as unknown as Bindings,
    waitUntil: () => undefined,
    environmentName: "production",
    client: "test",
    telemetryDisabled: true,
  };
}
