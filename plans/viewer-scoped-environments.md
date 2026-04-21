## Viewer-Scoped Environments

## Phase 1 — Stop env from leaking into builds

### Goal

Eliminate the class of bugs where a developer's dev env leaks into production because env identity is baked into the build. Shift env from a **property of the deployment** to a **property of the viewer**:

- The deployed bundle contains no env.
- Every request resolves env per-viewer from a `camox-env` cookie.
- Anonymous visitors always get `production`.

That's the entire scope of Phase 1. No ACL, no signed cookies, no fork/seed, no compat checks, no studio switcher. See **Phase 2 (longer vision)** at the end for where this is heading.

### Motivation

Today's model bakes `environmentName` into the bundle via Vite's `define` (`packages/sdk/src/features/vite/vite.ts:111`) and into generated route source text (`packages/sdk/src/features/vite/routeGeneration.ts:39,60,61`). Consequences:

- **Dev-server watcher race:** if `vite dev` is running when `vite build` runs, the dev server's `watchRouteFiles` reverts the build's regenerated routes back to their dev values (`remi-dev`), so the production bundle ships with a dev env name baked in.
- **Laptop builds conflate build machine with deploy target:** building on a dev's machine has no reliable way to know whether the artifact is destined for prod, staging, or preview.
- **Same artifact can't serve multiple envs:** env is compiled in, so promoting a build across environments requires rebuilding.

Viewer-scoped envs dissolve all three: the bundle has no env, the dev watcher has nothing to fight over, and one artifact can serve anonymous-prod and editor-envs simultaneously.

### Security stance (Phase 1)

Envs are **not** a security boundary in this phase. The only authorization check is "is the authenticated user a member of the project's org?" — which already exists. Within a project's org, any authenticated user can read or write any env by setting the cookie. That's acceptable because envs exist to keep teammates from stepping on each other's toes, not to isolate data between them.

Anonymous visitors have no session and therefore cannot set a trusted cookie; they always resolve to `production`.

Not addressed in Phase 1 (and pre-existing, not a regression): an authenticated org member can write to `production` by setting the cookie. Orthogonal to this plan.

### Architecture

#### Per-request env resolution

Server middleware resolves env for each request:

```ts
function resolveRequestEnv(req, authenticatedUser): string {
  if (!authenticatedUser) return "production";
  return parseCookie(req, "camox-env") ?? "production";
}
```

No signing, no access check — cookie is trusted for authenticated org members. Anonymous → `production` unconditionally.

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

`resolveEnvironmentNameServerFn` is a TanStack Start `createServerFn` that runs only server-side, reads the `camox-env` cookie and auth session from request headers, and returns the resolved env name.

Why this works without touching the root:

- The `_camox` pathless layout already wraps every Camox-rendered route: the splat `/_camox/$`, `/cmx-studio`, `/cmx-studio/*`, `/og`, and the `cmx` redirect.
- `beforeLoad` on a parent route makes its return value available as route context to all descendants.
- Route context from `beforeLoad` persists for the lifetime of the layout's mount; TanStack Router doesn't re-run parent `beforeLoad` when only the child route changes. Env resolves once per layout entry — same semantics as today's build-time constant.
- Non-Camox routes (`/dashboard`, marketing pages not rendered by Camox, etc.) aren't under `_camox`, so they're unaffected.

**Client behavior:** after SSR, the route context is hydrated into the client, `CamoxProvider` consumes it, and `initApiClient` / downstream consumers read from there. No network call on client-side navigations within the layout.

#### Non-layout server entry points

Several server entry points run _outside_ the `_camox` layout's `beforeLoad` and therefore don't see its route context. Each needs to call `resolveEnvironmentNameServerFn` (or the same underlying helper) directly:

- `_camox/og` route handler (`createOgHandler`) — generates OG images, needs env to fetch the right content.
- `_camox/$` page route's `markdownMiddleware` and `loader` (`createMarkdownMiddleware`, `createPageLoader`) — currently receive `environmentName` as a hardcoded string argument baked into the generated route file.
- `sitemap.ts` (`packages/sdk/src/features/metadata/sitemap.ts:17`) — currently reads the baked-in env.

After Phase 1, none of these accept an `environmentName` parameter; each resolves env from the incoming request.

#### Studio cookie setter (minimal)

No env-picker UI in Phase 1. A small server action writes the `camox-env` cookie for the authenticated user's default dev env (e.g. `${email-local-part}-dev`) and reloads. This replaces today's automatic build-time baking with an explicit "I'm in my dev env" cookie set on sign-in or first studio visit. The full interactive switcher is Phase 2.

#### Caching

Editor-facing pages (with `camox-env` cookie) must `Vary: Cookie` or be uncached. Anonymous pages cache normally at the edge. Standard pattern.

### API changes

The Hono middleware at `apps/api/src/index.ts:55-59` stops hardcoding `"production"` as the fallback and keeps trusting the `x-environment-name` header from the SDK. Anonymous (no session) requests without a header resolve to `"production"`. No access check added — matches the "envs are not a security boundary" stance above.

The SDK's API client always sets `x-environment-name` from the per-request env it resolved at SSR, so the header is reliably present for authenticated traffic.

### Vite plugin changes

Everything env-related in the build pipeline is deleted. Dev-server behavior is unchanged: `vite dev` still auto-targets the user's `${email-local-part}-dev` env for definition sync, it just no longer bakes that name into generated files or the bundle.

Removals:

- `resolveEnvironmentName` (`vite.ts:25-49`) — dev path stays (computed at dev-server start for sync only, not embedded anywhere), build path deleted.
- `__CAMOX_ENVIRONMENT_NAME__` in `define` (`vite.ts:111`).
- `environmentName` threaded through `generateRouteFiles` / `watchRouteFiles` (`vite.ts:106,182,212`, `routeGeneration.ts` throughout). Generated route files become env-agnostic — kills the dev-server watcher race.
- `environmentName` interpolated into generated route source (`routeGeneration.ts:39,60,61`).
- `environmentName` prop on `CamoxProvider` (`CamoxProvider.tsx:106,115,121,131`) — replaced by route context.
- `environmentName` parameter on `createMarkdownMiddleware`, `createPageLoader`, `createOgHandler`, and anything else that currently takes it as an argument.

**Kept as-is in Phase 1:**

- Build-time `closeBundle` sync targeting `"production"` (`vite.ts:229-262`). Still needed until Phase 2 moves sync to runtime. The only change: it's no longer parameterized by `environmentName` from `define` — "production" is passed explicitly as the sync target.
- Dev-server sync at server start (`vite.ts:219-226`). Unchanged — still targets `${email}-dev` computed locally.

### Implementation order

Each step is independently testable.

1. **`resolveEnvironmentNameServerFn`.** A `createServerFn` in the SDK that reads the `camox-env` cookie and session, returning a string. Anonymous → `"production"`.
2. **Non-layout entry points read request-scoped env.** Update `createMarkdownMiddleware`, `createPageLoader`, `createOgHandler`, and `sitemap.ts` to call the resolver instead of accepting `environmentName` as an argument.
3. **SSR handoff via `_camox.tsx`.** Add `beforeLoad` to the generated pathless layout template. `CamoxProvider` reads env from route context; `initApiClient` consumes it.
4. **Studio cookie setter.** Server action that writes the `camox-env` cookie for the user's default dev env. Invoked on first studio visit / sign-in.
5. **API middleware cleanup.** Remove the hardcoded `"production"` fallback in `apps/api/src/index.ts:55-59` — anonymous (no session) defaults to `"production"`, authenticated requests use the header verbatim.
6. **Delete build-time env baking.** Remove `__CAMOX_ENVIRONMENT_NAME__`, the env parameter from route generation, and all `environmentName` plumbing listed in Removals above. Build-time `closeBundle` sync stays but passes `"production"` explicitly.

### What this fixes

- **Dev env leaking to production:** structurally impossible. Builds contain no env.
- **Dev-server watcher race:** disappears. Generated routes are env-agnostic.
- **Laptop builds targeting different envs:** single artifact serves all envs via cookie.

---

## Phase 2 — Longer vision (not scoped yet)

Once Phase 1 is in, these become the natural follow-ups. Captured here so the direction isn't lost; none of this is designed in detail yet.

### Two-tier env model with fork-from-production

Only two ways to create an env:

- **Fork from production** — copies production's schema + content into a new env. Permitted only when the creating bundle's schema is **compatible** with production's.
- **Seed from bundle** — creates an empty env with auto-derived seed content (from block/layout default values). Used when a fork would be incompatible.

Forks diverge freely after creation; their schema evolves with the developer's code.

### Schema manifest + compatibility rule

A canonical, order-stable JSON description of the bundle's block + layout definitions (both `content` and `settings` shapes), embedded in the bundle as a constant with a stable hash. Bundle `B` is compatible with parent `P` iff `B ⊇ P` for every block's content shape, settings shape, and for layout fields — adding optional fields is fine, removing or tightening is not.

Compatibility checked server-side by comparing two manifests.

### Fork-or-seed on dev startup

The Vite dev server replaces today's "compute env name" path with: check if the env exists; if not, attempt fork from production; on incompatible schema, auto-fall back to seed with a clear log explaining why.

### Runtime definition sync

Build-time `closeBundle` sync goes away. Instead, on first request to a cold deployed server, the server checks whether its bundle's schema hash matches the env it's resolving for; if not, it pushes definitions. Cost: a slow first request after deploy.

Open problem to solve before building this: rollback. A rollback from v2→v1 would push a narrower schema to production and could drop editor content. Likely rule: runtime sync only ever widens; narrowing requires an explicit out-of-band migration.

### Studio env switcher + compat banner

Interactive `EnvironmentMenu.tsx`: lists envs the user can access, switches via cookie + reload. When an editor views an env whose `schemaHash` differs from the bundle's, inject a banner ("this env was last synced with a different schema"). On production, schema-hash mismatch is a deploy-policy violation — hard 500.

### Access control (if/when it matters)

Phase 1 treats envs as non-security. If envs later need to be isolated (e.g. per-customer preview envs, untrusted collaborators), the resolver grows a real access check and the cookie becomes signed. Not needed today.
