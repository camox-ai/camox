# CLI Auth Consent Flow

## Problem

The current CLI login flow redirects to `/login?redirect=http://localhost:{port}/callback`. If the user is already logged in to the web app, they never go through the login form, so the redirect with the callback URL is never honored.

## Solution

Split into two concerns like OAuth:

1. **Authentication** (login) — handled by the existing `_auth` layout
2. **Authorization** (consent) — a new page where the user explicitly authorizes the CLI

## Changes

### 1. New consent route: `apps/web/src/routes/_app.dashboard.cli-authorize.tsx`

- Lives under the `dashboard` layout so it **requires auth** (unauthenticated users get redirected to `/login` automatically via the existing `beforeLoad` guard, with `redirect` back to this page).
- Reads `callback` from search params (the CLI's local server URL).
- Shows a consent UI: "Camox CLI wants to perform actions on your behalf" with [Authorize] and [Deny] buttons.
- On **Authorize**: calls `authClient.oneTimeToken()` to generate an OTT, then redirects to `{callback}?ott={token}`.
- On **Deny**: shows a "you can close this tab" message or redirects to dashboard.

### 2. Rename `cli-authenticated` → `cli-authorized`

- Rename `_app._auth.cli-authenticated.tsx` → `_app._auth.cli-authorized.tsx`
- Update the route path inside the file from `cli-authenticated` to `cli-authorized`
- Update the reference in `packages/cli/src/lib/auth.ts` (the redirect after callback)

### 3. Update CLI auth flow: `packages/cli/src/lib/auth.ts`

- Change the login URL from:
  ```
  /login?redirect=http://localhost:{port}/callback
  ```
  to:
  ```
  /dashboard/cli-authorize?callback=http://localhost:{port}/callback
  ```
- Update the post-callback redirect from `/cli-authenticated` to `/cli-authorized`
- Everything else (local server, OTT verification, token storage) stays the same.

## Flow

```
CLI                          Browser                        API
 │                              │                             │
 ├─ start local server          │                             │
 ├─ open /dashboard/cli-authorize?callback=localhost:PORT/callback
 │                              │                             │
 │                    ┌─ not logged in? ──────────────────┐   │
 │                    │  redirect to /login?redirect=...  │   │
 │                    │  user logs in                     │   │
 │                    │  redirect back to /dashboard/     │   │
 │                    │    cli-authorize?callback=...     │   │
 │                    └──────────────────────────────────-┘   │
 │                              │                             │
 │                    show consent page                       │
 │                    user clicks [Authorize]                 │
 │                              ├─ POST one-time-token ──────►│
 │                              │◄─── { token } ─────────────┤
 │                              │                             │
 │◄── redirect to localhost:PORT/callback?ott=TOKEN           │
 │                              │                             │
 ├─ verify OTT ────────────────────────────────────────────► │
 │◄─ session token ──────────────────────────────────────────┤
 ├─ store token                 │                             │
 ├─ redirect browser to /cli-authorized                      │
 │                    show "You're all set!"                  │
```
