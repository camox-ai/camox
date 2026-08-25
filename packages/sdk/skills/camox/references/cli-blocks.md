# Managing Blocks with the Camox CLI

Read [cli-common.md](cli-common.md) first. Replace `{{CAMOX_CMD}}` as described there and verify commands with `--help`.

Use these commands for Block instances and their Content. To change which fields or rendering a Block type provides, use the Block Definition reference instead.

## Inspect before changing

Look up the Page before creating or moving Blocks so you have its `id`, current Blocks, and any sibling ids. Describe the Block type before constructing Content:

```sh
{{CAMOX_CMD}} pages get --path /
{{CAMOX_CMD}} blocks describe --type hero
```

## Create and position a Block

```sh
{{CAMOX_CMD}} blocks create --page-id 25 --type hero --content '{...}'
{{CAMOX_CMD}} blocks create --page-id 25 --type hero --content '{...}' --position first
{{CAMOX_CMD}} blocks create --page-id 25 --type hero --content '{...}' --before-id 174
{{CAMOX_CMD}} blocks create --page-id 25 --type hero --content '{...}' --after-id 174
```

`blocks create` and `blocks move` accept the same positioning flags. Pass at most one:

| Flag                      | Meaning                                         |
| ------------------------- | ----------------------------------------------- |
| `--position first`        | Put the Block first.                            |
| `--position last`         | Put the Block last; this is the create default. |
| `--after-id <ID>`         | Put it immediately after a sibling Block.       |
| `--before-id <ID>`        | Put it immediately before a sibling Block.      |
| `--after-position <KEY>`  | Insert after a known fractional-index key.      |
| `--before-position <KEY>` | Insert before a known fractional-index key.     |

Prefer `--position`, `--after-id`, and `--before-id`. A move requires one positioning flag.

## Edit Block Content

Content patches merge ordinary fields, so send only fields that should change:

```sh
{{CAMOX_CMD}} pages get --path /pricing
{{CAMOX_CMD}} blocks edit --id 314 --content '{"headline": "New headline"}'
```

## Edit repeatable Content safely

A repeatable field's array is replacement-shaped: omitting an existing item deletes it and cascades to its file references, settings, and nested items. Fetch the Block, preserve every existing item with `_itemId`, and add changes only to the intended entries:

```sh
{{CAMOX_CMD}} blocks get --id 99

{{CAMOX_CMD}} blocks edit --id 99 --content '{
  "items": [
    {"_itemId": 401},
    {"_itemId": 402, "answer": "Updated answer."},
    {"_itemId": 403}
  ]
}'
```

The response's `repeatableItems` contains each item's `id`, `fieldName`, `parentItemId`, and Content. Use the same `_itemId` pattern recursively for nested repeatables. Fetch multiple Blocks together when useful:

```sh
{{CAMOX_CMD}} blocks get-many --id 99 --id 100 --id 101
```

`blocks get-many` returns the same bundle shape as `blocks get`, in requested-id order.

## Draft and live reads

```sh
{{CAMOX_CMD}} blocks get --id 314        # draft
{{CAMOX_CMD}} blocks get --id 314 --live # published snapshot
```

Publish or discard at the Page level; read [cli-pages.md](cli-pages.md) when the task includes review or publication.
