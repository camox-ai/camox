# Managing Pages with the Camox CLI

Read [cli-common.md](cli-common.md) first. Replace `{{CAMOX_CMD}}` as described there and verify commands with `--help`.

Use these commands for Page paths and metadata, Layout assignments, draft review, and publishing. Use [cli-blocks.md](cli-blocks.md) when changing the ordered Blocks or Content on a Page.

## Create a Page with an existing Layout

```sh
{{CAMOX_CMD}} layouts list
{{CAMOX_CMD}} pages create --path-segment about --layout-id 39
```

Use `--parent-page-id <ID>` to nest the Page under another Page. Assigning an existing Layout is a CLI content operation; creating or changing a Layout Definition is a code operation covered by the Layout Definition reference.

## Review draft and live state

```sh
{{CAMOX_CMD}} pages get --path /pricing        # draft
{{CAMOX_CMD}} pages get --path /pricing --live # published snapshot
```

Live reads fail when the Page or Block has never been published. `--live` is not a write target and does not publish anything.

## Publish after approval

```sh
{{CAMOX_CMD}} pages publish --path /pricing
```

`pages publish` accepts exactly one of `--id` or `--path`. It publishes the Page's current draft and, by default, its Layout. Publishing the Layout is a no-op when it has no pending changes. Use `--no-layout` only when the user explicitly does not want pending Layout changes published with the Page:

```sh
{{CAMOX_CMD}} pages publish --path /pricing --no-layout
```

Do not publish merely because a draft edit succeeded. Summarize the draft and wait for the user to ask or approve publication.

## Unpublish or discard drafts

Remove a Page from live without deleting its draft:

```sh
{{CAMOX_CMD}} pages unpublish --path /pricing
```

Reset a draft to its current live snapshot without changing live:

```sh
{{CAMOX_CMD}} pages discard-changes --path /pricing
```

Both commands accept exactly one of `--id` or `--path`. Discarding fails if the Page has never been published.
