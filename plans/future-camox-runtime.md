# Future Camox Runtime

## Goal

Build a side-by-side Camox-owned routing and SSR runtime under `/_future` so Camox can eventually drop TanStack Start and TanStack Router from Camox apps.

The final runtime should make Camox apps feel Camox-first: users author Blocks, Layouts, Components, and CSS while Camox owns Page rendering, Studio routes, preview behavior, metadata, client navigation, and special responses.

## Decisions

- Develop the new runtime under the reserved `/_future` prefix until it is ready.
- Do not add user-facing or internal configuration for enabling this exploration initially. It can be wired directly while under active development.
- Do not create a temporary TanStack route for `/_future`.
- In dev, the Camox Vite plugin should intercept `/_future/*` directly with middleware and bypass TanStack Start/Router for those requests.
- The final runtime core uses the standard Fetch API shape: `Request -> Promise<Response>`.
- Do not make Nitro the runtime foundation. Nitro may be one compatible platform plugin, but the Camox runtime must be adapter-neutral.
- Do not build platform adapters for now. Let users keep using platform Vite plugins such as Nitro, Cloudflare, Netlify, etc. once the Camox runtime exposes standard server/client entries.
- Keep TanStack Query for data caching and hydration.
- Avoid implementing a general-purpose router. Camox needs a small Page runtime with reserved internal paths.

## Desired Final App Shape

```txt
src/
  blocks/
  layouts/
  components/
  styles.css
```

The user should not need to author or see:

- `src/routes`
- `src/router.tsx`
- `src/routeTree.gen.ts`
- generated TanStack route files
- a `createApp` entrypoint

Blocks and Layouts should continue to use public authoring imports such as:

```ts
import { createBlock } from "camox/createBlock";
import { createLayout } from "camox/createLayout";
```

## Runtime Contract

The core runtime should be organized around a Fetch-compatible handler:

```ts
handleCamoxRequest(request: Request): Promise<Response>
```

The handler owns:

- matching reserved Camox paths
- loading Pages by full path
- SSR
- client navigation data responses
- Camox Studio routes
- preview behavior
- metadata, favicon, and OG image behavior
- markdown responses
- sitemap responses
- not-found behavior
- TanStack Query dehydration/hydration data

Platform-specific Vite plugins should be responsible for deployment/build target behavior. Camox should provide runtime entries and Vite integration, not a separate adapter matrix.

## Future Route Table

Under the development prefix, route matching should behave as if the prefix were stripped first:

```txt
/_future/about -> /about
```

The internal matcher should then use a small ordered table:

```txt
/_camox/data     client navigation/data endpoint
/camox           Camox Studio shell
/camox/content   Camox Studio content view
/camox/*         Camox Studio nested routes
/og              OG image endpoint
/sitemap.xml     sitemap response
/*               Camox Page by full path
```

The final cutover uses the same matcher without the `/_future` prefix.

## Implementation Plan

### 1. Reserve and intercept `/_future`

Add Vite dev middleware from the Camox Vite plugin that handles `/_future/*` before TanStack Start/Router sees the request.

First milestone:

```txt
/_future/_camox/health -> 200 OK
```

Then normalize prefixed paths:

```txt
/_future/about -> pathname /about
```

This proves Camox can bypass TanStack routes in dev without introducing temporary generated route files.

### 2. Introduce Camox navigation primitives

Create a Camox-owned navigation abstraction so SDK internals are not coupled to TanStack Router.

Conceptual API:

```ts
import { Link, Navigate, useLocation, useNavigate } from "camox/navigation";
```

Initially, the existing app can provide a TanStack-backed implementation. The future runtime can provide a Camox-owned History API implementation.

Migrate SDK internals away from direct imports from `@tanstack/react-router`, including Studio and Preview components.

For user-authored Blocks, move toward plain anchors rendered from Camox link props:

```tsx
<myBlock.Link name="cta">{(props) => <a {...props} />}</myBlock.Link>
```

The future client runtime can intercept same-origin anchor clicks globally.

### 3. Extract Page loading from TanStack-specific APIs

Move the Page-loading behavior currently embedded in TanStack route/server-function code into Request/Response-neutral helpers.

These helpers should receive explicit inputs such as:

- `Request`
- pathname
- project slug
- environment name
- API URL
- `QueryClient`

They should not depend on:

- `createServerFn`
- `createMiddleware`
- `getRequest()` from TanStack Start
- `setResponseHeader()` from TanStack Start
- `notFound()` from TanStack Router

Preserve existing behavior:

- Draft Source for authenticated Studio/preview navigation
- Live Source for public page reads
- stale auth cookie fallback
- block cache seeding
- Page metadata building
- favicon URL building
- markdown content negotiation
- 404 detection

Existing TanStack routes can temporarily call the extracted helpers so current behavior does not drift.

### 4. Build the minimal future matcher

Implement the ordered route matcher behind `/_future`.

Start with route classification only:

```txt
page
studio
studio-content
og
sitemap
data
not-found
```

Then wire each route type to a placeholder response before adding real rendering.

### 5. Add virtual Camox app registry

Add a virtual module for the future runtime:

```txt
virtual:camox/app
```

It should discover user-authored definitions from:

```txt
src/blocks/*.{ts,tsx}
src/layouts/*.{ts,tsx}
```

During migration, it can also support the current structure for compatibility:

```txt
src/camox/blocks/*.{ts,tsx}
src/camox/layouts/*.{ts,tsx}
```

Internally this may still construct the same registry shape that `createApp` produces today, but users should not need to author or see a `createApp` file.

### 6. Render Pages server-side under `/_future`

First real rendering milestone:

```txt
/_future/about
```

renders the same Camox Page as:

```txt
/about
```

but through the future runtime and without any TanStack route file.

This milestone should include:

- per-request `QueryClient`
- Page lookup by normalized full path
- draft/live source behavior
- block cache seeding
- Layout and Block rendering
- metadata generation
- favicon link
- 404 response

Client navigation can still be full-page reload at this stage.

### 7. Add future client entry and hydration

Add a Camox-owned browser entry for the future runtime.

It should:

- hydrate server-rendered React
- create a browser `QueryClient`
- hydrate TanStack Query state
- mount the Camox navigation provider
- expose current pathname/search/hash

The milestone is successful when `/_future` pages SSR and hydrate without TanStack Start.

### 8. Add the data endpoint

Add:

```txt
/_future/_camox/data?path=/about
```

The response should include enough data for client-side navigation:

- route kind/status
- loader data
- dehydrated TanStack Query cache
- head metadata
- redirect/not-found information if needed

This endpoint should reuse the same Page-loading helpers as SSR.

### 9. Add client-side navigation

Implement Camox's small browser router:

- intercept same-origin anchor clicks
- ignore external links, downloads, modified clicks, and non-self targets
- call `history.pushState`
- handle `popstate`
- fetch `/_future/_camox/data`
- hydrate/merge TanStack Query cache
- update document head
- render the new Page state
- apply basic scroll behavior

The milestone is successful when internal links inside `/_future` navigate without a full reload.

### 10. Mount Studio under `/_future`

Add future Studio handling:

```txt
/_future/camox
/_future/camox/content
/_future/camox/*
```

This validates the Camox navigation abstraction against the most complex SDK surfaces, not just public Pages.

### 11. Add special responses

Add support for remaining runtime-owned responses:

```txt
/_future/og
/_future/sitemap.xml
```

Also add markdown negotiation for Page requests:

```txt
Accept: text/markdown
/_future/about -> text/markdown response when available
```

These should all use standard `Request`/`Response` behavior.

### 12. Hardening pass

Before cutover, verify:

- 404 behavior
- stale auth cookie behavior
- metadata/head replacement
- favicon behavior
- OG image behavior
- markdown responses
- sitemap responses
- Studio navigation
- Preview behavior
- HMR behavior
- hydration mismatch warnings
- asset and CSS loading
- scroll behavior
- query cache consistency
- error boundaries

### 13. Cutover

After `/_future` reaches parity, switch the default app runtime to the Camox handler with no prefix.

At cutover, remove the user-visible TanStack app surface:

- stop generating route files
- stop generating `src/camox/app.ts`
- remove `src/router.tsx` from templates
- remove `src/routeTree.gen.ts` from templates
- remove TanStack Start client entry from templates
- remove TanStack Start/Router dependencies from templates
- remove TanStack Start/Router peer dependencies from `camox` once SDK internals no longer rely on them

## Non-goals

- Full feature parity with TanStack Start or TanStack Router.
- File-based routing for user apps.
- Arbitrary user-defined app routes in v1.
- Camox-owned platform adapter packages.
- Nitro-specific runtime APIs.

## Key Principle

`/_future` is only a prefixed proving ground. The implementation should be the real future runtime from the beginning:

```txt
future Request/Response runtime
  -> called by Vite dev middleware under /_future
  -> later called by production server entries
  -> eventually used at the root with no prefix
```

Avoid creating a separate temporary implementation that must be rewritten during cutover.
