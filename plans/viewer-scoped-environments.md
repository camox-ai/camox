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

Envs are **not** a security boundary in this phase. The cookie is trusted at read time; authorization is enforced **at issuance**, not at resolution.

- The cookie-setter endpoint is the only way a `camox-env` cookie gets issued. That endpoint verifies the caller's BetterAuth session (by forwarding `Better-Auth-Cookie` to `api.camox.ai/api/auth/get-session`) before emitting `Set-Cookie`.
- SSR blindly trusts whatever `camox-env` cookie is present. No per-request session check — none is possible anyway, since document navigations on Camox-powered sites carry no session material (the cross-domain plugin routes BetterAuth sessions through `localStorage` + custom headers, not same-host cookies).
- Anonymous visitors are never issued a cookie; no mechanism exists for them to acquire one (`HttpOnly` blocks JS-side writes; the setter endpoint rejects unauthenticated callers).
- Sign-out clears the cookie (`Set-Cookie: camox-env=; Max-Age=0`), closing the "stale cookie reads dev content after sign-out" window.

Within a project's org, any authenticated user can read or write any env by setting the cookie. That's acceptable because envs exist to keep teammates from stepping on each other's toes, not to isolate data between them.

Not addressed in Phase 1 (and pre-existing, not a regression): an authenticated org member can write to `production` by setting the cookie. Orthogonal to this plan.

### Architecture

#### Per-request env resolution

Server middleware resolves env for each request:

```ts
function resolveRequestEnv(req): string {
  return parseCookie(req, "camox-env") ?? "production";
}
```

No signing, no session check — the cookie is trusted unconditionally. Authorization is enforced at issuance (see "Studio cookie setter" below). Missing cookie → `production`.

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

`resolveEnvironmentNameServerFn` is a TanStack Start `createServerFn` declared inline in the generated `_camox.tsx` (server-only code is stripped from the client bundle by TanStack Start). It reads the `camox-env` cookie from request headers and returns the resolved env name (or `"production"` if absent). The SDK exports the underlying resolver helper (pure function of request → string); the generated file just wraps it in `createServerFn` so TanStack Start's per-app build picks it up. User-owned code never touches it — same ownership model as today's generated routes.

Why this works without touching the root:

- The `_camox` pathless layout already wraps every Camox-rendered route: the splat `/_camox/$`, `/cmx-studio`, `/cmx-studio/*`, `/og`, and the `cmx` redirect.
- `beforeLoad` on a parent route makes its return value available as route context to all descendants.
- Route context from `beforeLoad` persists for the lifetime of the layout's mount; TanStack Router doesn't re-run parent `beforeLoad` when only the child route changes. Env resolves once per layout entry — same semantics as today's build-time constant.
- Non-Camox routes (`/dashboard`, marketing pages not rendered by Camox, etc.) aren't under `_camox`, so they're unaffected.

**Client behavior:** after SSR, the route context is hydrated into the client, `CamoxProvider` consumes it, and `initApiClient` / downstream consumers read from there. No network call on client-side navigations within the layout.

#### Client-side API client and `x-environment-name`

The API client keeps today's shape: module-level state seeded once by `initApiClient(apiUrl, environmentName)` at provider init, read on every outbound fetch to attach `x-environment-name`. `CamoxProvider` calls `initApiClient` with the env from route context instead of from a build-time constant.

Why this is safe under Phase 1:

- Parent `beforeLoad` doesn't re-run on child navigations, so route context env is stable for the lifetime of the `_camox` layout's mount.
- The only way to change env is cookie-set → full reload → SSR re-runs → module re-inits. No in-tab env change, no staleness window.
- `initApiClient` must ref-check **both** `apiUrl` and `environmentName` and re-init when either changes. Today's code (`CamoxProvider.tsx:119-123`) only keys on `apiUrl`, so a future env change without an apiUrl change would leave a stale `x-environment-name` baked into the client's headers. Required fix, not defensive — closes a latent bug and removes a Phase 2 switcher footgun.

Trade-off accepted: one env per page at a time. If Phase 2 or later needs two envs live on the same page (e.g. anonymous-prod preview next to an editor in a dev env), this singleton must be replaced with a per-call or per-React-context env source. Out of scope now.

#### Non-layout server entry points

Several entry points currently receive `environmentName` as a baked-in argument. Each gets it from the `_camox` layout's route context instead, via the normal TanStack Router parent→child context flow:

- `_camox/$` page route's `loader` (`createPageLoader`): reads `context.environmentName` from its loader argument. No direct cookie parsing — it's a child of `_camox`, so the parent's `beforeLoad` context is already merged in.
- `_camox/$` page route's `markdownMiddleware` (`createMarkdownMiddleware`): runs on `server.middleware` and doesn't receive loader-style context. It calls the server-fn resolver helper from the request instead — functionally identical to what the parent's `beforeLoad` does, just invoked from a server-handler context.
- `sitemap.ts` (`packages/sdk/src/features/metadata/sitemap.ts:17`): same — calls the resolver from the request, since it's a standalone server endpoint outside the route tree. **The public export `generateSitemap(origin)` keeps its current signature**; env is resolved internally via `getRequest()`. User-owned `src/routes/sitemap.xml.ts` (in CLI template + playground) does not change.

`createOgHandler` is untouched: it makes no API calls, has no `environmentName` parameter today (`ogRoute.ts:3`), and only transforms URL query params into an image via `layout._internal.buildOgImage`.

After Phase 1, none of the affected entry points accept an `environmentName` parameter; each derives it from the request-scoped source (route context for loaders, resolver helper for server handlers).

#### Studio cookie setter (minimal)

No env-picker UI in Phase 1. The `camox-env` cookie for the authenticated user's default dev env (`${email-local-part}-dev`) is set via a single client-side effect in `CamoxProvider`:

On mount, if the user is authenticated (known from `authClient.useSession()`) and the app has not yet recorded a cookie-set attempt for this browser, the provider POSTs to a server action on the same site, forwarding the `Better-Auth-Cookie` header (read from localStorage via the existing `getAuthCookieHeader()` helper). The server action:

1. Calls `api.camox.ai/api/auth/get-session` with that header to validate the session and retrieve the user's email. This mirrors the cross-domain trick the RPC link already uses — no new auth plumbing.
2. On success, computes `${email-local-part}-dev` and responds with `Set-Cookie: camox-env=<env>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`.
3. On failure (no session, expired session), responds 401 and sets no cookie.

The client reloads on a 2xx response. This causes a one-time content flash — first render resolves to `production`, reload lands on the dev env — but fires at most once per browser. The "already-authenticated-in-a-fresh-browser" case (session in localStorage, env cookie absent) is the common trigger; post-sign-in is the other.

**Sign-out clears the cookie.** `authClient.signOut()` is wrapped (or a hook on the `sign-out` endpoint is added) so that the same flow also POSTs to a sibling server action which emits `Set-Cookie: camox-env=; Max-Age=0; Path=/`. This closes the "stale cookie keeps serving dev content after sign-out" window that falls out of Fix 1's trust-the-cookie model.

The env name is computed deterministically from the session's email — no user input, no UI. The full interactive switcher (pick among accessible envs) is Phase 2.

#### Cookie attributes

```
Set-Cookie: camox-env=${envName};
            HttpOnly;
            Secure;
            SameSite=Lax;
            Path=/;
            Max-Age=31536000
```

- **`HttpOnly`** — only the server reads the cookie (the resolver server fn and API middleware). JS never needs it, since the client API client gets env from route context (see "Client-side API client" above).
- **`SameSite=Lax`** — blocks CSRF on cross-site state-changing requests while still sending the cookie on top-level navigations (following a link into the site). `Strict` would drop the cookie on those first-click navigations and show production content for one request.
- **`Secure`** — HTTPS-only. `localhost` is treated as secure by modern browsers even without TLS, so local dev still works; verify during implementation if any dev tooling complains.
- **`Path=/`** — required because multiple server entry points outside `_camox` read env (`sitemap.ts`, future non-layout endpoints).
- **No `Domain`** — cookie stays bound to the exact host. Camox sites run on arbitrary user domains, so there's no useful subdomain-sharing story.
- **`Max-Age=31536000`** (~1 year) — it's a preference cookie, not a credential. Persists across browser restarts so editors don't re-trigger the fallback reload every session. Safe even after sign-out: the resolver requires an authenticated user, so anonymous requests return `production` regardless of cookie contents.

Cookie name is literal `camox-env`. Reserve the `camox-` prefix for future Camox-owned cookies so they can't collide with user-owned cookies on the same host.

#### Caching

Requests carrying a `camox-env` cookie respond with `Cache-Control: private, no-store`. Requests without one respond with today's cache headers unchanged — and crucially, no `Vary: Cookie` is ever emitted.

Why not `Vary: Cookie`: CDNs key the cache entry on the entire `Cookie` header, including unrelated cookies (PostHog, analytics, ad tech). Emitting `Vary: Cookie` fragments the anonymous cache by every cookie combination seen in the wild and collapses hit rates. Splitting the behavior by cookie presence sidesteps the trap: anonymous traffic caches cleanly; editors (a small fraction of traffic, already doing live edits) don't cache. If editor-side latency becomes a complaint, a Phase 2 option is edge-level cookie normalization (strip `Cookie` down to `camox-env` before `Vary`), but that needs per-CDN config and isn't worth it now.

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
- `environmentName` parameter on `createMarkdownMiddleware` and `createPageLoader`, and anything else that currently takes it as an argument. (`createOgHandler` never took one — leave as-is.)

**Kept as-is in Phase 1:**

- Build-time `closeBundle` sync targeting `"production"` (`vite.ts:229-262`). Still needed until Phase 2 moves sync to runtime. The only change: it's no longer parameterized by `environmentName` from `define` — "production" is passed explicitly as the sync target.
- Dev-server sync at server start (`vite.ts:219-226`). Unchanged — still targets `${email}-dev` computed locally.
- `createServerApiClient(apiUrl, environmentName)` in `packages/sdk/src/lib/api-client-server.ts`. Used by `definitionsSync.ts` at build/dev time; sync is not viewer-scoped, so this parameter stays intentionally.
- `EnvironmentMenu.tsx` (`features/studio/components/EnvironmentMenu.tsx`). Keeps reading env from `AuthContext`; the upstream source changes (route context instead of `CamoxProvider` prop literal) but the component itself doesn't.

### Implementation order

Each step is independently testable.

1. **`resolveEnvironmentNameServerFn`.** A `createServerFn` in the SDK that reads the `camox-env` cookie and session, returning a string. Anonymous → `"production"`.
2. **Non-layout entry points read request-scoped env.** Update `createMarkdownMiddleware`, `createPageLoader`, and `sitemap.ts` to call the resolver instead of accepting `environmentName` as an argument. (`createOgHandler` is unaffected — see "Non-layout server entry points".)
3. **SSR handoff via `_camox.tsx`.** Add `beforeLoad` to the generated pathless layout template. `CamoxProvider` reads env from route context; `initApiClient` consumes it.
4. **Studio cookie setter.** Server action that writes the `camox-env` cookie for the user's default dev env. Invoked on first studio visit / sign-in.
5. **API middleware cleanup.** Remove the hardcoded `"production"` fallback in `apps/api/src/index.ts:55-59` — anonymous (no session) defaults to `"production"`, authenticated requests use the header verbatim.
6. **Delete build-time env baking.** Remove `__CAMOX_ENVIRONMENT_NAME__`, the env parameter from route generation, and all `environmentName` plumbing listed in Removals above. Build-time `closeBundle` sync stays but passes `"production"` explicitly. **Before deleting the `define`:** grep the monorepo + published CLI templates for `__CAMOX_ENVIRONMENT_NAME__` to confirm only `sitemap.ts` references it. `closeBundle`'s inner Vite server is created with `configFile: false` (`vite.ts:234-240`) and inherits no `define`, so any user-authored module referencing the constant would silently break. Low probability (private internal name) but cheap to verify.

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
