# Nitro-first Camox runtime plan

## Context

The current `future` runtime is intended to become the whole Camox runtime. The runtime core already has the right high-level shape: a web-standard `Request -> Response` handler. The main architectural problem is in development glue: user app/layout/block modules can be loaded through temporary Vite module runners, and values from those modules can escape the runner lifetime. OG image generation exposed this because `layout._internal.buildOgImage()` performs a deferred dynamic import after the layout object has escaped.

This plan has two phases:

1. Promote the future runtime to the primary/root runtime and remove `future` naming from code.
2. Make the runtime Nitro-first while keeping `vite dev` as the developer command.

## Decisions

- Nitro is required for the new runtime.
- The new app template will include Nitro from the start.
- Development keeps `vite dev` as the command.
- Vite dev should delegate runtime request execution to a persistent Nitro-backed server graph.
- Camox core remains adapter-neutral and web-standard: `Request -> Response`.
- No hosting preset/config abstraction initially. Nitro only, with no Camox-level deployment config in this phase.
- The runtime should be root-mounted, not under `/_future`.
- Existing virtual module conventions stay: `virtual:camox/app`, `virtual:camox/document`, etc.

## Phase 1 — Promote future runtime to primary runtime

Goal: make the current future runtime the only runtime concept in code and remove the `future` terminology before adding Nitro. This reduces migration complexity and avoids carrying two mental models.

### Starting point

Start from the current simple OG implementation, not the temporary workaround path. Do not introduce:

- a separate OG virtual server module
- `buildOgImageElement` on layout internals
- adapter-level `renderOgImage` delegation solely to dodge temp module runner lifetime
- forced OG response body materialization solely for closed-runner safety

Those changes optimize around the implementation we intend to remove. The promoted runtime should keep OG conceptually boring and let Phase 2 fix the module lifetime problem by moving all runtime execution into a persistent Nitro graph.

### Scope

- Rename future runtime files, types, functions, and virtual module names to runtime names.
- Root-mount the promoted runtime.
- Remove legacy TanStack Start route generation/runtime paths where practical.
- Keep behavior equivalent to current future runtime while changing names and route mounting.

### Proposed renames

Runtime files:

- `packages/sdk/src/features/runtime/futureRuntime.ts` -> `runtime.ts`
- `packages/sdk/src/features/runtime/futurePageServer.tsx` -> `pageServer.tsx`
- `packages/sdk/src/features/runtime/futurePageClient.tsx` -> `pageClient.tsx`
- `packages/sdk/src/features/runtime/futurePageApp.tsx` -> `pageApp.tsx`
- `packages/sdk/src/features/runtime/futureStudioApp.tsx` -> `studioApp.tsx`
- `packages/sdk/src/features/runtime/futureStudioServer.tsx` -> `studioServer.tsx`
- `packages/sdk/src/features/runtime/futurePageNavigation.ts` -> `pageNavigation.ts`
- `packages/sdk/src/features/runtime/futureStudioNavigation.ts` -> `studioNavigation.ts`

Vite glue:

- `packages/sdk/src/features/vite/futureRuntimeDev.ts` -> `runtimeDev.ts`

Types/functions:

- `FutureRuntimeOptions` -> `RuntimeOptions`
- `FutureRuntimeRouteKind` -> `RuntimeRouteKind`
- `FutureRuntimeRouteMatch` -> `RuntimeRouteMatch`
- `FuturePageRenderInput` -> `PageRenderInput`
- `FutureStudioRenderInput` -> `StudioRenderInput`
- `handleFutureCamoxRequest` -> `handleCamoxRequest`
- `matchFutureRuntimeRoute` -> `matchRuntimeRoute`
- `getFutureRuntimePathname` -> `getRuntimePathname`
- `DEFAULT_FUTURE_RUNTIME_BASE_PATH` removed or replaced with root behavior

Virtual modules:

- `virtual:camox/future-page-server` -> `virtual:camox/page-server`
- `virtual:camox/future-studio-server` -> `virtual:camox/studio-server`
- `virtual:camox/future-page-client` -> `virtual:camox/page-client`
- Do not add any temporary OG-specific future virtual module while promoting the runtime.

Package exports:

- `camox/_internal/futurePageServer` -> `camox/_internal/pageServer`
- `camox/_internal/futurePageClient` -> `camox/_internal/pageClient`
- `camox/_internal/futureStudioServer` -> `camox/_internal/studioServer`

Consider keeping compatibility exports temporarily only if internal build ordering requires it. Prefer removing them if no public template relies on them yet.

### Route behavior

Promoted runtime routes should be root-mounted:

- `/` and page paths -> page SSR / markdown negotiation
- `/_camox/health` -> health
- `/_camox/registry` -> registry
- `/_camox/data` -> page data
- `/og` -> OG image
- `/sitemap.xml` -> sitemap
- `/camox` and `/camox/*` -> studio

Asset and dev-server paths must not be swallowed by page catchall:

- `/@*`
- `/src/*`
- `/node_modules/*`
- Vite HMR/client paths
- static files with extensions
- public assets

### Remove legacy runtime assumptions

Remove or disable generated TanStack Start route files for:

- page route
- OG route
- studio routes

Remove legacy route-generation code only after the promoted root runtime handles the same responsibilities in dev.

### OG behavior after promotion

Keep OG on the simple layout code path:

```ts
const layout = camoxApp.getLayoutById(layoutId);
return layout._internal.buildOgImage(params);
```

If OG remains unstable before Nitro lands, treat that as confirmation of the module-runner lifetime problem rather than adding feature-specific workarounds. The fix is Phase 2: execute this same boring OG code inside the persistent Nitro graph.

### Validation

- `pnpm check`
- Existing runtime page SSR works at root paths.
- Page data works at `/_camox/data`.
- Markdown negotiation works.
- Sitemap works at `/sitemap.xml`.
- Studio works at `/camox`.
- OG may remain unstable until Phase 2 if it still runs through disposable Vite module runners, but no new OG-specific workaround should be added.

## Phase 2 — Nitro-first runtime with `vite dev`

Goal: eliminate temporary Vite module runners by executing all runtime requests inside one persistent Nitro/Vite server graph.

### Target architecture

Development:

```txt
vite dev
  -> Camox Vite plugin configures/starts persistent Nitro runtime
  -> Vite middleware delegates runtime requests to Nitro/runtime handler
  -> virtual:camox/server
  -> handleCamoxRequest(request)
```

Production:

```txt
Nitro server/build output
  -> virtual:camox/server
  -> handleCamoxRequest(request)
```

The invariant:

```txt
request handler + camoxApp + layouts + blocks + SSR + OG
all live in one persistent server module graph
```

No user app/layout/block value should be loaded from a disposable module runner and used after that runner closes.

### Add canonical server entry

Add a virtual module:

- `virtual:camox/server`

It should export a web-standard handler, not a Nitro-specific public API:

```ts
export async function handleCamoxRequest(request: Request): Promise<Response | null>;
```

Inside that module, assemble runtime options from stable imports:

- import `camoxApp` from `virtual:camox/app`
- import `camoxDocument` from `virtual:camox/document`
- import page server renderer
- import studio server renderer
- call promoted core `handleCamoxRequest`

OG should be handled inside this stable graph by calling the layout’s normal `_internal.buildOgImage`.

### Add Nitro handler shell

Add a thin Nitro/H3 handler that adapts Nitro requests to the web-standard Camox server entry.

Responsibilities:

- Convert/access the incoming web `Request`.
- Call `virtual:camox/server`’s handler.
- If Camox returns `null`, allow the request to fall through where Nitro supports it, or return a 404 depending on how the route is mounted.
- Return the web `Response` unchanged.

Keep Nitro-specific logic out of the core runtime.

### Vite dev integration

Keep `vite dev` as the command, but stop using per-request temp Vite servers for runtime execution.

The Camox Vite plugin should:

- register virtual modules as it does today
- configure/start a persistent Nitro dev/runtime instance
- delegate app/runtime requests to that persistent runtime
- keep Vite asset/HMR requests handled by Vite first

Request precedence in dev:

1. Vite internals and HMR
2. source/module requests (`/@*`, `/src/*`, etc.)
3. static/public assets
4. Camox reserved routes (`/_camox/*`, `/og`, `/sitemap.xml`, `/camox/*`)
5. page catchall

### Build integration

For now, Nitro is the server build authority. No Camox hosting preset config is needed.

The build path needs to ensure:

- `virtual:camox/server` is Nitro’s server entry or is imported by Nitro’s server entry.
- `virtual:camox/page-client` is emitted as a browser client asset.
- The server can discover/inject the correct production client entry URL.

Client entry URL is the main build-design detail to solve:

- Dev can use a Vite module URL such as `/@id/...`.
- Prod needs the emitted asset URL from a manifest or Nitro/Vite build metadata.

### Remove temporary module-runner code

Once Nitro dev execution works, remove:

- `withFutureTempServer` / renamed equivalent
- per-request `createServer(...)` runtime module loading
- fallback paths that catch missing runnable Vite environment and create a temp server
- Any remaining OG-specific materialization hacks that only exist to survive closed module runners
- Any `buildOgImageElement`-style workaround if one was introduced locally during experimentation

### OG end state

OG becomes normal runtime code again:

```ts
const layout = camoxApp.getLayoutById(layoutId);
if (!layout?._internal.buildOgImage) return new Response("Not found", { status: 404 });
return layout._internal.buildOgImage({ title, description, projectName });
```

No dynamic-import lifetime special case should remain.

### Risks / open implementation details

- How exactly to mount Nitro under the existing Vite dev server while preserving Vite HMR and asset precedence.
- How to emit and reference the page client entry in production.
- How Nitro stable exposes the web `Request`/`Response` bridge in the version we adopt.
- How to keep public/static assets from being swallowed by the root page catchall.
- Whether any legacy generated TanStack Start files must remain temporarily during app-template migration.

### Validation

- `pnpm check`
- New template runs with `vite dev`.
- Root page SSR works without TanStack Start/Router routes.
- `/og` works through the boring layout handler and does not crash Vite.
- Response streaming/body reads do not depend on closed module runners.
- HMR updates blocks/layouts/document without restarting dev server.
- Production Nitro build starts and serves page SSR, OG, sitemap, data, markdown, and studio routes.

## Success criteria

The migration is complete when:

- There is no `future` runtime concept left in code or filenames.
- The promoted runtime is root-mounted and is the only Camox site runtime.
- Dev uses `vite dev`, but runtime request execution happens in a persistent Nitro-backed server graph.
- There are no temp Vite servers/module runners in request handling.
- OG generation is implemented with the same simple layout code path as the old runtime.
- Core runtime remains web-standard and adapter-neutral.
