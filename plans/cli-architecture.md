## CLI Architecture Plan

### One Package: `camox` = SDK + CLI

The `camox` package ships both the SDK (blocks, layouts, preview UI) and the CLI. One dependency, always version-matched.

CLI source lives in a separate `packages/cli/` package (`@camox/cli`) to keep the SDK package lean. The `camox` package re-exports it via a thin bin wrapper:

```js
// packages/sdk/bin/camox.mjs
#!/usr/bin/env node
import '@camox/cli';
```

```json
// packages/sdk/package.json
{
  "name": "camox",
  "bin": { "camox": "./bin/camox.mjs" },
  "dependencies": {
    "@camox/cli": "workspace:*"
  }
}
```

Users still see one package and one `bin` — the split is purely internal.

### `create-camox` is eliminated

Replaced entirely by `npx camox init`.

---

### CLI Commands

#### `npx camox init`

The only onboarding command. Auto-detects context:

- **Inside a TanStack Start app** (detects `@tanstack/react-start` in `package.json`):
  - Installs `camox` as a dependency
  - Scaffolds `src/camox/blocks/` and `src/camox/layouts/` with starter examples
  - Adds the Vite plugin to `vite.config.ts`
  - Adds `CamoxProvider` to root route
  - If `~/.camox/auth.json` exists, skips auth prompt and uses stored token
  - If not, prompts for login and stores the token in `~/.camox/auth.json`
  - Writes env vars

- **No TanStack Start app detected**:
  - Scaffolds a new TanStack Start project first
  - Then runs the same setup as above (including auth token handling)

#### `pnpm camox login`

Auth to camox.ai. Stores token in `~/.camox/auth.json`. All subsequent commands read from this file automatically — no env vars or prefixing needed.

#### `pnpm camox logout`

Removes the stored token from `~/.camox/auth.json`.

#### `pnpm camox help`

Lists available commands with short descriptions. Each command also supports `--help` for detailed usage (e.g. `pnpm camox init --help`).

---

### Authentication

All CLI commands authenticate via a token stored in `~/.camox/auth.json`. This is set once via `camox login` (or during `camox init` if no token exists) and reused by every subsequent command.

This means any process on the machine — the user, an AI agent like Claude Code, a CI script — can call CLI commands without env vars or interactive prompts. Same model as `gh`, `wrangler`, `gcloud`.

---

### Future: Content Editing via CLI

The CLI can expose content commands, enabling AI agents to build and edit sites without a browser:

```bash
pnpm camox page list
pnpm camox page create "/about" --title "About Us"
pnpm camox block add hero --page "/about"
pnpm camox block update <id> --content '{"heading": "..."}'
```

All commands use the stored auth token. An agent like Claude Code can chain these to scaffold entire pages from a prompt, or read existing content to understand the site before making changes.

Not a priority until the core CLI is solid.
