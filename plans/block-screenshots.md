## Block Screenshots via CLI

### Goal

Give the Camox CLI a command that returns a PNG screenshot of a block rendered in peek mode (using `getPeekBundle()` placeholder content — no real page data needed). Primary consumer is a coding agent driving the CLI: generate or edit a block, screenshot it, read the PNG back, iterate.

### Approach

Render in the user's existing Chrome (located via `chrome-launcher`), driven over the Chrome DevTools Protocol. No Playwright/Puppeteer dependency — the heavy artifact (the browser binary) is BYO and assumed already installed on a developer machine.

The vite plugin exposes a peek route per block type. The CLI spawns headless Chrome on demand, navigates to that route against the running dev server, captures the screenshot, writes it to disk, and shuts the browser down.

### Pieces

- **Vite plugin**: a peek route (e.g. `/_camox/peek/:blockType`) that mounts a single block in `mode="peek"` with `getPeekBundle()` content. Sets a `window.__camoxReady` flag once fonts and images have settled, so the screenshotter knows when to fire.
- **CLI command**: e.g. `camox blocks screenshot --type Hero --out ./hero.png`. Resolves the dev server URL, locates Chrome, launches it headless, captures, writes the PNG, kills Chrome.
- **No new SDK/CLI deps beyond `chrome-launcher` + a small CDP client** (both <1MB combined). No Playwright.

### Open Questions

- Dev server requirement: assume `vite dev` is already running, or spin up an ephemeral one (the plugin's `closeBundle` already shows the pattern)? Ephemeral is friendlier but slower.
- Cold-start cost (~500ms–1s per Chrome launch) is fine for one-off use but painful in a tight agent loop. A `--watch` / daemon mode that keeps Chrome alive across invocations could be a follow-up if real usage demands it.
- Fallback for users without Chrome installed (Safari/Firefox-only): fail with a clear error message pointing at install instructions, or skip silently? Probably the former.
- Viewport sizing: fixed default (e.g. 1280×800) vs. flag-controlled. Fixed is simpler; agents probably don't care about responsive variants in the first pass.
