# Environment Scoping

Add an `environments` table to scope all content data per-environment (production vs development), so developers can iterate on schemas and content without affecting production or each other.

### Terminology: "environment" not "deployment"

We use "environment" because it immediately communicates the concept (dev/staging/prod) and matches how developers already think. "Deployment" sounds like a CI/CD action.

### Environment naming

Each environment has a human-readable `name` that is unique per project:

- `"production"` — auto-created with the project, always exists. This is the default when no environment is specified.
- `"alice-dev"`, `"bob-dev"` — developer environments, named by convention as `{name}-dev`. Each developer configures their environment name in the Vite plugin config.

The environment name is set in the Vite plugin config (`environmentName` option). This means it's fixed for a given dev server session. However, because it's transmitted as a simple header (`x-environment-name`), the architecture naturally supports runtime switching via a UI dropdown in the future — the SDK would just override the header per-request.

## 1. Schema: Add `environments` table and `environment_id` foreign keys

### 1a. New `environments` table in `apps/api/src/schema.ts`

Add an `environments` table between the `projects` and `layouts` table definitions:

```ts
export const environments = sqliteTable(
  "environments",
  {
    id: int().primaryKey({ autoIncrement: true }),
    projectId: int("project_id")
      .notNull()
      .references(() => projects.id),
    name: text().notNull(), // human-readable: "production", "alice-dev"
    type: text().notNull().$type<"production" | "development">(),
    createdAt: int("created_at").notNull(),
    updatedAt: int("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("environments_project_name_idx").on(table.projectId, table.name),
    index("environments_project_idx").on(table.projectId),
  ],
);
```

### 1b. Add `environmentId` FK to the 4 environment-scoped tables

Add an `environmentId` column to each of:

- `layouts`
- `pages`
- `blockDefinitions`
- `files`

The column definition for each:

```ts
environmentId: int("environment_id")
  .notNull()
  .references(() => environments.id),
```

`blocks` and `repeatableItems` do NOT get an `environmentId` — they're already scoped through their parent `page` or `layout`, which carry `environmentId`.

Also add indexes to support the new query patterns:

- `layouts`: add index on `(environment_id, layout_id)`
- `pages`: add index on `(environment_id, full_path)`
- `blockDefinitions`: add index on `(environment_id, block_id)`
- `files`: add index on `(environment_id)`

### 1c. SQL migration file

Create `apps/api/migrations/0008_add_environments.sql` with:

1. `CREATE TABLE environments`
2. `ALTER TABLE layouts ADD COLUMN environment_id INTEGER REFERENCES environments(id)`
3. `ALTER TABLE pages ADD COLUMN environment_id INTEGER REFERENCES environments(id)`
4. `ALTER TABLE block_definitions ADD COLUMN environment_id INTEGER REFERENCES environments(id)`
5. `ALTER TABLE files ADD COLUMN environment_id INTEGER REFERENCES environments(id)`
6. `CREATE INDEX` statements for the new indexes

### 1d. Register in `apps/api/src/db.ts`

Add `environments` to the schema import and the `schema` object.

## 2. API: Environment resolution

### 2a. New utility: `apps/api/src/lib/resolve-environment.ts`

The environment can't be resolved in a global middleware because we don't know the project until inside the procedure. Instead, create a shared utility:

```ts
export async function resolveEnvironment(
  db: Database,
  projectId: number,
  environmentName: string,
  options?: { autoCreate?: boolean },
) {
  let environment = await db
    .select()
    .from(environments)
    .where(and(eq(environments.projectId, projectId), eq(environments.name, environmentName)))
    .get();

  if (!environment && options?.autoCreate) {
    const now = Date.now();
    environment = await db
      .insert(environments)
      .values({
        projectId,
        name: environmentName,
        type: "development",
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  }

  if (!environment) {
    throw new ORPCError("NOT_FOUND", {
      message: `Environment "${environmentName}" not found`,
    });
  }
  return environment;
}
```

The `autoCreate` option is used by sync procedures (block definitions sync, layout sync). When a new developer first runs `vite dev`, their Vite plugin sends e.g. `x-environment-name: alice-dev`. The sync procedure doesn't know _who_ the developer is (the `x-sync-secret` is project-level, not per-developer), but that's fine — the environment name itself provides isolation. Two developers use different environment names (`alice-dev`, `bob-dev`), each configured in their own local Vite config. The identity of the creator doesn't matter; only the namespace matters.

### 2b. Pass environment name through the request chain

**`apps/api/src/types.ts`**: Add `environmentName: string` to `AppEnv.Variables`.

**`apps/api/src/orpc.ts`**: Add `environmentName: string` to `BaseContext`.

**`apps/api/src/index.ts`**:

- Add `"x-environment-name"` to CORS `allowHeaders`.
- Add a Hono middleware (after session middleware) that reads the header and sets the variable, defaulting to `"production"`:
  ```ts
  app.use("*", async (c, next) => {
    c.set("environmentName", c.req.header("x-environment-name") || "production");
    await next();
  });
  ```
- Pass `environmentName: c.var.environmentName` into the oRPC handler context.

## 3. API: Update route handlers

### 3a. `apps/api/src/routes/projects.ts` — auto-create production environment

`create` procedure: after inserting the project, also insert an environment:

```ts
await context.db.insert(environments).values({
  projectId: result.id,
  name: "production",
  type: "production",
  createdAt: now,
  updatedAt: now,
});
```

### 3b. `apps/api/src/routes/block-definitions.ts` — scope all procedures

- `list`: resolve environment from `projectId` + `context.environmentName`, add `eq(blockDefinitions.environmentId, environment.id)` to the where clause.
- `sync`: resolve environment (with `autoCreate: true`), use `environment.id` in all upsert queries and inserts.
- `upsert`: same pattern as sync.
- `delete`: resolve environment, add `environmentId` to where clause.

### 3c. `apps/api/src/routes/layouts.ts` — scope all procedures

- `list`: resolve environment, filter by `environmentId`.
- `sync`: resolve environment (with `autoCreate: true`), use `environment.id` in upserts/inserts.

### 3d. `apps/api/src/routes/pages.ts` — scope public queries by environment

The public procedures `getByPath` and `getStructure` currently receive only `{ path }`. They need to know the project to resolve the environment.

**Add `projectSlug: z.string()` to the input schema** of `getByPath` and `getStructure`. Then:

1. Look up project by slug.
2. Resolve environment from project + `context.environmentName`.
3. Query page by `fullPath` + `environmentId`.

**Other page procedures:**

- `list`: add `projectId` to input, resolve environment, filter by `environmentId`.
- `create`: resolve environment from `projectId` + `context.environmentName`, set `environmentId` on new page.
- `get`, `update`, `delete`, `setAiSeo`, `setMetaTitle`, `setMetaDescription`, `setLayout`, `generateSeo`: operate by page ID. The page already has `environmentId`. No changes needed — authorization already covers project membership.

### 3e. `apps/api/src/routes/blocks.ts` — scope `getUsageCounts`

- `getUsageCounts`: currently returns global counts. Add `projectId` to input, resolve environment, join `blocks` → `pages`/`layouts` to filter by `environmentId`.
- All other block procedures: operate on existing block IDs that are already transitively scoped. No changes.

### 3f. `apps/api/src/routes/repeatable-items.ts`

No changes — repeatable items are scoped through blocks → pages/layouts.

### 3g. `apps/api/src/routes/files.ts` — scope list and upload

- `list`: add `projectId` to input, resolve environment, filter by `environmentId`.
- Upload (Hono route): resolve environment from `projectId` + environment name header, set `environmentId` on new file.
- All other file procedures: operate on existing file IDs. No changes.

## 4. API: Update seed endpoint

### `apps/api/src/routes/seed.ts`

Update `seedContent`:

1. After creating the project, create a `"production"` environment.
2. Pass the environment ID when inserting `layouts`, `pages`, `blockDefinitions`, and `files`.

## 5. SDK: Send environment name header

### 5a. Vite plugin options — `packages/sdk/src/features/vite/vite.ts`

Add `environmentName?: string` to `CamoxPluginOptions`:

```ts
/** Environment name for this instance (default: "production"). Convention: "{name}-dev" for developer environments. */
environmentName?: string;
```

The Vite plugin is where the environment is initially defined. This sets the header for the lifetime of the dev server / build. In the future, runtime switching via a UI dropdown can be layered on top — the SDK would simply override the `x-environment-name` header per-request, which the header-based architecture naturally supports without any API changes.

Pass it to definition sync, route generation, and the `define` block (so it's available at build time as `__CAMOX_ENVIRONMENT_NAME__`).

### 5b. Server API client — `packages/sdk/src/lib/api-client-server.ts`

Update `createServerApiClient` to accept and send `x-environment-name`:

```ts
export function createServerApiClient(
  apiUrl: string,
  syncSecret?: string,
  environmentName?: string,
): ServerApiClient {
  const headers: Record<string, string> = {};
  if (syncSecret) headers["x-sync-secret"] = syncSecret;
  if (environmentName) headers["x-environment-name"] = environmentName;
  const link = new RPCLink({ url: `${apiUrl}/rpc`, headers });
  return createORPCClient<ServerApiClient>(link);
}
```

### 5c. Client API client — `packages/sdk/src/lib/api-client.ts`

Update `initApiClient` to accept and send `x-environment-name`:

```ts
export function initApiClient(apiUrl: string, environmentName?: string): ApiClient {
```

Add the header to the `RPCLink` config.

### 5d. Definition sync — `packages/sdk/src/features/vite/definitionsSync.ts`

Add `environmentName` to `DefinitionsSyncOptions`. Pass it to all `createServerApiClient` calls.

### 5e. Route generation — `packages/sdk/src/features/vite/routeGeneration.ts`

Pass `environmentName` into the generated `CamoxProvider` as a prop:

```tsx
<CamoxProvider ... environmentName="${environmentName || ""}">
```

Also pass `projectSlug` and `environmentName` to the generated page route's `createPageLoader` and `createMarkdownMiddleware` calls, since `getByPath` now requires `projectSlug`.

### 5f. CamoxProvider — `packages/sdk/src/features/provider/CamoxProvider.tsx`

- Add `environmentName?: string` to `CamoxProviderProps`.
- Pass it through `AuthContext`.
- Pass it to `initApiClient(apiUrl, environmentName)`.

### 5g. Auth context — `packages/sdk/src/lib/auth.ts`

Add `environmentName?: string` to `AuthContextValue`.

### 5h. Page route factories — `packages/sdk/src/features/routes/pageRoute.tsx`

Update `createMarkdownMiddleware` and `createPageLoader`:

- Accept `projectSlug` and `environmentName` parameters.
- Pass `projectSlug` to `api.pages.getByPath({ path, projectSlug })`.
- Pass `environmentName` to the internal `createServerApiClient` call.

### 5i. Update `getByPath` callers in the SDK

**`packages/sdk/src/lib/queries.ts`**: Update `pageQueries.getByPath` to accept and pass `projectSlug`:

```ts
getByPath: (fullPath: string, projectSlug: string) => ({
  ...getOrpc().pages.getByPath.queryOptions({
    input: { path: fullPath, projectSlug },
    staleTime: Infinity,
  }),
  queryKey: queryKeys.pages.getByPath(fullPath),
}),
```

Update all call sites in the SDK that use `pageQueries.getByPath` — primarily in `CamoxPreview.tsx` and any other components — to pass `projectSlug` from `AuthContext`.

## 6. SDK UI: Show environment name in ProjectMenu

### `packages/sdk/src/features/studio/components/ProjectMenu.tsx`

Read `environmentName` from `AuthContext`. In the trigger button, show a `Badge` next to the project name when the environment is not production:

```tsx
import { Badge } from "@camox/ui/badge";

// Inside the trigger:
<div className="flex items-center gap-2">
  <Favicon size={16} />
  <span>{project.name}</span>
  {authCtx?.environmentName && authCtx.environmentName !== "production" && (
    <Badge variant="secondary" className="font-mono text-xs">
      {authCtx.environmentName}
    </Badge>
  )}
</div>;
```

Also show the environment name in the popover header, below the project name:

```tsx
<div className="flex flex-col gap-2 p-4">
  <h3 className="font-mono text-sm leading-none">{project.name}</h3>
  {authCtx?.environmentName && authCtx.environmentName !== "production" && (
    <span className="text-muted-foreground text-xs">{authCtx.environmentName}</span>
  )}
</div>
```

## Summary of files changed

| File                                                          | Change                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `apps/api/src/schema.ts`                                      | Add `environments` table; add `environmentId` to `layouts`, `pages`, `blockDefinitions`, `files` |
| `apps/api/src/db.ts`                                          | Register `environments` in schema                                                                |
| `apps/api/migrations/0008_add_environments.sql`               | New migration                                                                                    |
| `apps/api/src/types.ts`                                       | Add `environmentName` to `AppEnv.Variables`                                                      |
| `apps/api/src/orpc.ts`                                        | Add `environmentName` to `BaseContext`                                                           |
| `apps/api/src/index.ts`                                       | Add environment name middleware, CORS header, pass to oRPC context                               |
| `apps/api/src/lib/resolve-environment.ts`                     | **New** — environment resolution utility with auto-create                                        |
| `apps/api/src/routes/projects.ts`                             | Create production environment on project create                                                  |
| `apps/api/src/routes/block-definitions.ts`                    | Scope all procedures by `environmentId`                                                          |
| `apps/api/src/routes/layouts.ts`                              | Scope all procedures by `environmentId`                                                          |
| `apps/api/src/routes/pages.ts`                                | Add `projectSlug` to `getByPath`/`getStructure`; scope `list`/`create` by `environmentId`        |
| `apps/api/src/routes/blocks.ts`                               | Scope `getUsageCounts` by environment                                                            |
| `apps/api/src/routes/files.ts`                                | Scope `list` + upload by `environmentId`                                                         |
| `apps/api/src/routes/seed.ts`                                 | Create environment in seed; set `environmentId` on all inserts                                   |
| `packages/sdk/src/features/vite/vite.ts`                      | Add `environmentName` option; propagate to sync + routes                                         |
| `packages/sdk/src/features/vite/definitionsSync.ts`           | Pass `environmentName` to server client                                                          |
| `packages/sdk/src/features/vite/routeGeneration.ts`           | Pass `environmentName` + `projectSlug` into generated routes                                     |
| `packages/sdk/src/lib/api-client.ts`                          | Accept + send `x-environment-name` header                                                        |
| `packages/sdk/src/lib/api-client-server.ts`                   | Accept + send `x-environment-name` header                                                        |
| `packages/sdk/src/lib/auth.ts`                                | Add `environmentName` to `AuthContextValue`                                                      |
| `packages/sdk/src/lib/queries.ts`                             | Update `getByPath` to accept `projectSlug`                                                       |
| `packages/sdk/src/features/provider/CamoxProvider.tsx`        | Accept + propagate `environmentName`                                                             |
| `packages/sdk/src/features/routes/pageRoute.tsx`              | Accept `environmentName` + `projectSlug` in factories                                            |
| `packages/sdk/src/features/studio/components/ProjectMenu.tsx` | Show environment name badge                                                                      |
