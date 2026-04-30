---
name: camox-cli
description: "How to read or modify the website's content (pages and the sections inside them) via the Camox CLI. This is a Camox-powered site, so any request about its content — even when phrased generically — is a Camox operation. Use this skill whenever the user wants to add, remove, rename, reorder, or change anything visible on the site: a new page or route, a section / hero / footer / etc., the title or wording shown to visitors, what appears at a URL, the SEO title or social-share preview, the structure shared across pages, etc. Trigger broadly — on phrases like 'add a page', 'put a hero at the top', 'change the headline', 'move this section', 'what's on /about', 'fix the meta title', 'rename this route', 'why does this show up on every page' — and on similar requests even when the user doesn't say 'page', 'block', 'layout', 'CMS', 'Camox', or 'CLI'. When in doubt and the request touches site content, load this skill."
---

# Using the Camox CLI

The Camox CLI is the right tool for any **CRUD operation on CMS content** — pages, block instances, layout assignments, meta fields. Reach for it before writing a custom script or asking the user to click through the dashboard. The `camox` binary is already installed in this project (it ships with the `camox` package).

## When to use this skill vs. `camox-block` / `camox-layout`

This skill (`camox-cli`) is for **content** — the actual pages, the actual block instances on those pages, the wording and images visitors see. If the user wants to add a section to a specific page, change copy, reorder blocks, create a new route, swap which layout a page uses, or fix a meta title, you're editing content and you want the CLI.

The `camox-block` skill is for **block definitions** — the `.tsx` files in `src/camox/blocks/` that define what _kinds_ of blocks exist (their schema, fields, and rendering). Reach for it only when the user wants to introduce a new type of section that doesn't exist yet (e.g. "we need a pricing-table section and we've never built one"), or change the schema or rendering of an existing block type.

The `camox-layout` skill is for **layout definitions** — the `.tsx` files in `src/camox/layouts/` that define the shared shells around page content (which navbar/footer blocks wrap pages, how meta titles are built, OG images, etc.). Reach for it when the user wants a new kind of page wrapper, a different shared structure, or to change how titles or social previews are constructed. _Assigning_ an existing layout to a page is content — that's the CLI.

Rule of thumb: if the change should be visible on the live site without a code deploy, it's content → use the CLI. If it requires editing source files in `src/camox/blocks/` or `src/camox/layouts/`, it's a definition → use `camox-block` or `camox-layout`. Some requests need both (e.g. "add a pricing section the site has never had before" = define the block via `camox-block`, then create an instance on a page via the CLI).

## Running the CLI

This project uses **{{PM_NAME}}**. Always invoke the CLI as:

```sh
{{CAMOX_CMD}} <command> [options]
```

For example: `{{CAMOX_CMD}} pages list`, `{{CAMOX_CMD}} blocks types`.

## Discover commands with `--help`

The CLI surface evolves. **Don't guess command names or flags from memory — ask the CLI.** Run `--help` at the root and on every subcommand before invoking it, and treat the output as authoritative.

```sh
# top-level: lists command groups (pages, blocks, layouts, ...)
{{CAMOX_CMD}} --help

# a group: lists its subcommands
{{CAMOX_CMD}} pages --help

# a subcommand: lists its required and optional flags
{{CAMOX_CMD}} pages create --help
```

The CLI is organised into command groups around the resource types (pages, blocks, layouts, …). Use `--help` to discover what each group supports — the exact set of subcommands and flags is the CLI's responsibility, not this skill's.

## Common recipes

Most content tasks fit into a small number of shapes. Use these as the entry-point template, then verify exact flags with `--help`. Always look up the page (`pages get`) before you create or move blocks — you'll need its `id` and the `id` / `type` of any sibling block you're positioning relative to.

### Add a new block at a specific spot on a page

```sh
# 1) Find the page and the sibling you'll position relative to.
{{CAMOX_CMD}} pages get --path /
# read the response to grab pageId and the id of the existing first block

# 2) See what fields the block type accepts.
{{CAMOX_CMD}} blocks describe --type hero

# 3) Create the new block at the desired position.
# At the very top of the page:
{{CAMOX_CMD}} blocks create --page-id 25 --type hero --content '{...}' --position first
# Or right before / after a known sibling:
{{CAMOX_CMD}} blocks create --page-id 25 --type hero --content '{...}' --before-id 174
{{CAMOX_CMD}} blocks create --page-id 25 --type hero --content '{...}' --after-id 174
# Or appended to the end (default):
{{CAMOX_CMD}} blocks create --page-id 25 --type hero --content '{...}'
```

See **Block positioning** below for the full set of options.

### Update copy in an existing block

```sh
# 1) Locate the block on the page.
{{CAMOX_CMD}} pages get --path /pricing
# note the block id you want to edit

# 2) Patch only the fields you want to change — content is merged.
{{CAMOX_CMD}} blocks edit --id 314 --content '{"headline": "New headline"}'
```

### Create a new page using an existing layout

```sh
# 1) List layouts and pick one.
{{CAMOX_CMD}} layouts list

# 2) Create the page under that layout.
{{CAMOX_CMD}} pages create --path-segment about --layout-id 39
# Use --parent-page-id <ID> to nest the page under another route.
```

## Block positioning

`blocks create` and `blocks move` accept the same set of positioning flags. **Pass at most one** — combining them is rejected. `move` requires one (use `--position last` to send a block to the end); `create` defaults to appending at the end if you pass none.

| Flag                      | Meaning                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `--position first`        | Place at the very top of the page.                                   |
| `--position last`         | Place at the very bottom of the page (also the create-time default). |
| `--after-id <ID>`         | Place immediately after the sibling block with that id.              |
| `--before-id <ID>`        | Place immediately before the sibling block with that id.             |
| `--after-position <KEY>`  | Low-level: insert after a known fractional-index key.                |
| `--before-position <KEY>` | Low-level: insert before a known fractional-index key.               |

Prefer the high-level flags (`--position`, `--after-id`, `--before-id`) — they read naturally and don't require you to know the fractional-index format. The `--after-position` / `--before-position` flags exist for cases where you already have a key in hand (e.g. piping output between commands).

## The `--production` flag

By default, every command runs against the **dev environment** — a per-user, isolated copy of the CMS that the dev server reads from. Changes you make here do not affect the live site, so dev is the safe place to experiment.

Pass `--production` to target the **live CMS** instead:

```sh
{{CAMOX_CMD}} pages list --production
{{CAMOX_CMD}} blocks edit --id <ID> --production
```

Only use `--production` when the user has explicitly asked to operate on live content. For everything else — exploration, tentative edits, anything you'd want to be able to throw away — stay on the default dev environment.

## Don't write slop — build understanding first

Anything you create with this CLI ends up on a real website read by real people. **Never invent generic filler copy** ("Welcome to our amazing platform", "Lorem ipsum"-grade headlines, plausible-sounding-but-fabricated stats, made-up testimonials, fake company names). That kind of content is worse than nothing — it ships, it gets indexed, and the user has to clean it up.

Before writing any block content:

1. **Read what already exists.** Use the CLI to list pages and inspect existing blocks (`{{CAMOX_CMD}} pages list`, `{{CAMOX_CMD}} pages get …`, `{{CAMOX_CMD}} blocks describe …`, etc. — discover the exact commands via `--help`). The site's voice, product positioning, naming, and recurring claims are usually already established somewhere; mirror them. A new "About" block on a site that already has hero/feature copy should sound like a continuation of that copy, not a fresh marketing draft.
2. **Pull real facts from the right source.** If the user gave you the content, use it verbatim. If the content describes something external (a person, company, product, paper, event, library), use web search or whatever fetch tools you have to look up actual details before writing. If you genuinely can't get a fact, ask the user — don't paper over it with a guess.
3. **For `File` and `Embed` fields, do not guess URLs.** These point at real assets (PDFs, videos, embeds). A hallucinated URL produces a broken link or, worse, a link to someone else's content. Leave the URL field blank and tell the user the asset still needs to be supplied — the CMS will treat the empty value correctly, and `toMarkdown` will skip the line.
4. **Same for `Image`.** Don't fabricate filenames. If you don't have a real uploaded asset to reference, leave it empty and flag it.

Short version: if you're tempted to "make something up that sounds about right", stop and either go find the real thing or hand the gap back to the user.

## Workflow

1. If the task matches one of the **Common recipes** above, start from that template — it's almost always the right shape.
2. Otherwise, run `{{CAMOX_CMD}} --help` to find the right command group, then `{{CAMOX_CMD}} <group> --help` and `{{CAMOX_CMD}} <group> <command> --help` to confirm the exact flags.
3. Before writing content, read existing pages/blocks and gather any external facts you need (see above).
4. Run the command against dev first (no `--production`).
5. Add `--production` only when the user has asked to touch live content.
