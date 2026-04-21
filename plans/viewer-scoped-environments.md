## Viewer-Scoped Environments

### Goal

Eliminate the class of bugs where a developer's dev environment leaks into production because environment identity is baked into the build. Shift environment from a **property of the deployment** to a **property of the viewer**, and introduce a strict two-tier env model:

- **production** — the canonical env, the only one anonymous visitors ever see.
- **forks of production** — temporary envs (per-developer, staging, etc.) created by forking production's content + schema, then diverging as code evolves.

The deployed build knows nothing about environments. Every request resolves env per-viewer from a cookie/account signal, defaulting to `production` for anonymous users.

### Motivation

Today's model bakes `environmentName` into the bundle via Vite's `define` (`packages/sdk/src/features/vite/vite.ts:111`) and into generated route source text (`packages/sdk/src/features/vite/routeGeneration.ts:39,60,61`). Consequences:

- **Dev-server watcher race:** if `vite dev` is running when `vite build` runs, the dev server's `watchRouteFiles` reverts the build's regenerated routes back to their dev values (`remi-dev`), so the production bundle ships with a dev env name baked in.
- **Laptop builds conflate build machine with deploy target:** building on a dev's machine has no reliable way to know whether the artifact is destined for prod, staging, or preview.
- **Same artifact can't serve multiple envs:** env is compiled in, so promoting a build across environments requires rebuilding.

Viewer-scoped envs dissolve all three: the bundle has no env, the dev watcher has nothing to fight over, and one artifact can serve anonymous-prod, editor-staging, editor-dev, etc. simultaneously.

### Architecture

#### Env resolution per request

Server middleware resolves env for each request:

```ts
function resolveRequestEnv(req, authenticatedUser): string {
  const cookieEnv = parseCookie(req, "camox-env");
  if (cookieEnv && userCanAccess(authenticatedUser, cookieEnv)) {
    return cookieEnv;
  }
  return "production"; // anonymous / no valid cookie → prod
}
```

Stores resolved env on `request.env.camoxEnv`. Downstream loaders and API clients read from here.

**Security invariant:** the cookie names an env; the server verifies the authenticated user has access to that env before honoring it. Anonymous users always get `"production"`, regardless of cookie contents.

#### SSR handoff via the Camox pathless layout

Env resolution lives on the `_camox.tsx` pathless layout — a file the Camox Vite plugin already generates (`packages/sdk/src/features/vite/routeGeneration.ts:21-46`). The user's `__root.tsx` and every other user-owned route are untouched.

The generated `_camox.tsx` gains a `beforeLoad` that calls a server function to resolve env from the request's cookie + session:

```tsx
export const Route = createFileRoute("/_camox")({
  beforeLoad: async () => ({
    environmentName: await resolveEnvironmentNameServerFn(),
  }),
  component: CamoxPathlessLayout,
});

function CamoxPathlessLayout() {
  const { environmentName } = Route.useRouteContext();
  return (
    <CamoxProvider ... environmentName={environmentName}>
      <Outlet />
    </CamoxProvider>
  );
}
```

`resolveEnvironmentNameServerFn` is a TanStack Start `createServerFn` that runs only server-side, reads the `camox-env` cookie and auth session from request headers, performs the user-access check, and returns the resolved env name. For anonymous requests it returns `"production"`.

Why this works without touching the root:

- The `_camox` pathless layout already wraps every Camox-rendered route: the splat `/_camox/$`, `/cmx-studio`, `/cmx-studio/*`, `/og`, and the `cmx` redirect.
- `beforeLoad` on a parent route makes its return value available as route context to all descendants.
- Route context from `beforeLoad` persists for the lifetime of the layout's mount and doesn't re-resolve on child navigations. Env resolves exactly once per layout entry — same semantics as today's build-time constant.
- Non-Camox routes (`/dashboard`, marketing pages that aren't rendered by Camox, etc.) aren't under `_camox`, so they're unaffected — they don't need env and don't pay the resolution cost.

**Client behavior:** after SSR, the route context is hydrated into the client, `CamoxProvider` consumes it, and `initApiClient` / downstream consumers read from there. No network call on client-side navigations within the layout. Switching envs in the studio triggers a full reload (per the Studio env switcher section), so SSR re-resolves with the new cookie on the next request.

#### Studio env switcher

The existing `EnvironmentMenu.tsx` (`packages/sdk/src/features/studio/components/EnvironmentMenu.tsx`) becomes interactive. A "switch env" action POSTs to a server action which:

1. Verifies the authenticated user has access to the target env.
2. Sets a signed `camox-env` cookie.
3. Triggers a reload so SSR re-resolves with the new cookie.

#### Caching

Editor-facing pages (with `camox-env` cookie) must `Vary: Cookie` or be uncached. Anonymous pages cache normally at the edge. Standard pattern.

### Two-tier env model with fork-from-production

Only two ways to create an env:

- **Fork from production** — copies production's schema + content into a new env. Permitted only when the creating bundle's schema is **compatible** with production's schema.
- **Seed from bundle** — creates an empty env with auto-derived seed content (from block/layout default values). Used when a fork would be incompatible.

Forks diverge freely after creation; their schema evolves with the developer's code.

#### Compatibility rule

Blocks in Camox have two parallel schemas: `content` (inline-editable fields) and `settings` (block-level configuration like alignment, variant, toggles — see `packages/sdk/src/core/createBlock.tsx:127,337-345`). Both are stored on the block row (`content` + `settings` columns) and both must be compat-checked.

Bundle schema `B` is compatible with parent schema `P` iff, for every block type in `P`:

1. Every block type used in `P` exists in `B`.
2. Every **content** field present in `P` is present in `B` with a compatible type.
3. Every **settings** field present in `P` is present in `B` with a compatible type.
4. Content and settings fields `B` adds that `P` doesn't have are optional or defaulted.

Equivalently: `B ⊇ P` for both the content shape and the settings shape of every block (and for layout fields). Adding optional blocks / content fields / settings is fine; removing or tightening either is not.

Checked server-side by comparing two schema manifests. Deterministic, cheap.

#### Schema manifest

A canonical, order-stable JSON description of the bundle's block + layout definitions, including both content and settings shapes:

```ts
type SchemaManifest = {
  blocks: Record<
    string,
    {
      content: Record<string, FieldType>;
      settings: Record<string, FieldType>;
      version: string;
    }
  >;
  layouts: Record<string, { content: Record<string, FieldType> }>;
};
```

Computed at build time from the same `camoxApp` module already loaded in `closeBundle` (`packages/sdk/src/features/vite/vite.ts:243`). Embedded in the bundle as a constant:

```ts
__CAMOX_SCHEMA_MANIFEST__: JSON.stringify(manifest),
__CAMOX_SCHEMA_HASH__: JSON.stringify(canonicalHash(manifest)),
```

Crucially, the manifest has **no env in it** — it describes what the bundle understands, not which env it's for.

#### Seed content (auto-derived only)

For each layout, generate a blank page using each block's default field values. The Vite plugin walks the definitions and emits seed content alongside the manifest. No explicit fixtures module — if users want richer seeds later, that can be added.

### API surface

#### Create env

```
POST /envs
  body: {
    name: string,
    bundleManifest: SchemaManifest,
    mode: "fork" | "seed",
    parent?: "production"    // required when mode === "fork"
  }
```

Server logic:

```
if mode === "fork":
  diff = compareSchemas(parent.schema, bundleManifest)
  if diff.breaking.length > 0:
    return 409 {
      reason: "incompatible-fork",
      breakingChanges: diff.breaking
    }
  env.schema = bundleManifest
  env.content = copy(parent.content)

if mode === "seed":
  env.schema = bundleManifest
  env.content = seedContentFromBundle
```

#### Env record

```ts
type Env = {
  name: string;
  schema: SchemaManifest;
  schemaHash: string;
  parent: string | null; // "production" for forks, null for prod itself
  forkedFromSchemaHash: string | null; // parent's schema hash at fork time
  createdMode: "fork" | "seed";
  createdAt: Date;
};
```

`forkedFromSchemaHash` enables future three-way diffs for promotion UX. Trivially added now, hard to backfill later.

#### Get env schema

```
GET /envs/:env/schema
  → SchemaManifest + hash
```

Used by the studio to compute compatibility banners.

### Vite plugin changes

#### Dev startup (replaces today's `resolveEnvironmentName` dev path)

```
1. Compute bundle manifest + hash from camoxApp.
2. Read ~/.camox/auth.json → determine target env name (e.g. "remi-dev").
3. Check if env exists in API:
     - Exists: sync definitions (today's behavior), continue.
     - Missing: attempt fork.
4. POST /envs { mode: "fork", parent: "production", name, bundleManifest }
5. On 409 incompatible:
     - Log breaking changes clearly (non-interactive: no prompt).
     - Auto-fallback: POST /envs { mode: "seed", name, bundleManifest }.
     - Log the fallback decision and why.
6. Env ready, dev server continues.
```

Always auto-fallback — Vite plugin runs non-interactively. Log to explain.

Example log output on fallback:

```
[camox] Cannot fork production into "remi-dev": schema incompatible.
[camox] Breaking changes vs production:
[camox]   - block `hero`: field `subtitle` removed
[camox]   - block `cta`: field `variant` type changed (string → enum)
[camox] Creating "remi-dev" from seed content instead.
```

#### Build

The Vite plugin stops computing `environmentName` for builds. No `CAMOX_ENV` required, no `define` for env name. Build emits manifest + hash only.

Removals:

- `resolveEnvironmentName` (`vite.ts:25-49`).
- `__CAMOX_ENVIRONMENT_NAME__` in `define` (`vite.ts:111`).
- `environmentName` threaded through `generateRouteFiles` / `watchRouteFiles` / `syncDefinitions` (`vite.ts:106,182,212,224,256`).
- `environmentName` interpolated into generated route source (`routeGeneration.ts:39,60,61`). Generated files become env-agnostic — kills the dev-server watcher race.
- Build-time `closeBundle` sync (`vite.ts:229-262`). Sync moves runtime-side (see below).

### Definition sync repositioning

Today two paths:

- Dev server sync (`vite.ts:219-226`) — runs at dev-server start, targets `remi-dev`. **Keep**, integrated with the fork flow above.
- Build-time sync (`vite.ts:229-262`) — runs in `closeBundle`, targets hardcoded "production". **Delete.**

Replacement: **sync on first request** from the deployed server. On cold start, the server checks whether its bundle's schema hash matches the env it's resolving for. If not, it pushes definitions. Cost: a slow first request after deploy. Acceptable, and naturally matches the viewer-scoped model.

### Compatibility detection in the studio

When an editor views an env whose `schemaHash` differs from the running bundle's `__CAMOX_SCHEMA_HASH__`:

- **Editor context:** inject an SSR banner: "This environment was last synced with a different schema. [View changes] [Sync]".
- **Anonymous on production:** enforce by deploy policy that `production.schemaHash === bundle.schemaHash`. On mismatch, 500 — a deploy happened without syncing, alert.

v1 check is equality only (match or don't). Structural diff is a later enhancement.

### Removals

After this migration lands, the following can be deleted or simplified:

- `resolveEnvironmentName` in `packages/sdk/src/features/vite/vite.ts:25-49`.
- `__CAMOX_ENVIRONMENT_NAME__` define (`vite.ts:111`).
- `environmentName` props and params across `CamoxProvider.tsx:106,115,121,131`, `pageRoute.tsx:40-94`, `routeGeneration.ts` (throughout).
- Build-time `closeBundle` sync (`vite.ts:229-262`).
- `environmentName` in `packages/sdk/src/features/metadata/sitemap.ts:17` — replaced with request-scoped env from SSR context.
- Hardcoded `"production"` fallback in API middleware (`apps/api/src/index.ts:55-59`) — replaced with per-request env resolution including user access check.

### Implementation order

Each step independently usable and testable.

1. **Schema manifest computation.** Add `computeSchemaManifest(camoxApp)` and `canonicalHash(manifest)` helpers. Emit both via Vite `define`. Verify hash stability.
2. **API: env record + manifest storage.** Migration to add `schema`, `schemaHash`, `parent`, `forkedFromSchemaHash`, `createdMode` columns. Update sync endpoints to accept and record manifests.
3. **API: `POST /envs` with fork/seed modes.** Include `compareSchemas` and seed-content generation. Return 409 with breaking changes on incompatible fork.
4. **Vite plugin: fork-or-seed on dev startup.** Replace today's `resolveEnvironmentName` dev path. Log breaking changes on fallback.
5. **Per-request env resolver + user access check.** Server middleware in the API and SDK's SSR entry. Signed `camox-env` cookie. Anonymous → `production`.
6. **SSR handoff via `_camox.tsx`.** Add `beforeLoad` + `resolveEnvironmentNameServerFn` to the generated pathless layout template (`packages/sdk/src/features/vite/routeGeneration.ts:21-46`). `CamoxProvider` reads env from route context; `initApiClient` consumes it. No user-owned routes change.
7. **Studio env switcher mutation.** Hook up `EnvironmentMenu.tsx` to the cookie-setting server action. Access check server-side.
8. **Equality-check compat banner.** Studio shows a warning when `env.schemaHash !== bundle.schemaHash`.
9. **Runtime definition sync.** On first request, server pushes definitions to its resolved env if the hash differs. Remove `closeBundle` build-time sync.
10. **Remove build-time env baking end-to-end.** Delete `resolveEnvironmentName`, `__CAMOX_ENVIRONMENT_NAME__`, and all `environmentName` prop/param plumbing.

### What this fixes

- **Dev env leaking to production** (the bug that prompted this plan): structurally impossible. Builds contain no env.
- **Dev-server watcher race:** disappears. Generated routes are env-agnostic.
- **Laptop builds targeting different envs:** single artifact serves all envs via cookie.
- **Forks starting in a broken state:** compatibility check enforces healthy forks; auto-seed fallback guarantees devs always get a working env.
