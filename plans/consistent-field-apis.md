# Consistent field APIs

Align field type names with their corresponding block component names so future field types (notably collections) slot in without introducing new conventions.

## Rule

Every `Type.X` has a matching `<block.X>` component (and `<item.X>` inside repeaters).

## Renames

| Before                                         | After                                                     |
| ---------------------------------------------- | --------------------------------------------------------- |
| `Type.RepeatableItem`                          | `Type.Repeater`                                           |
| `Type.Image({ multiple: true, defaultItems })` | `Type.ImageList({ defaultItems })`                        |
| `Type.File({ multiple: true, defaultItems })`  | `Type.FileList({ defaultItems })`                         |
| `block.MultipleAssets`                         | removed — split into `block.ImageList` / `block.FileList` |

The `multiple` option is dropped entirely. Single-arity helpers (`Type.Image`/`block.Image`, `Type.File`/`block.File`, `Type.Link`/`block.Link`, `Type.Embed`/`block.Embed`) stay as they are. No back-compat — playground and templates migrate in the same change.

## Why now

Collections will add `Type.CollectionList` / `Type.CollectionRef` with matching `<block.CollectionList>` / `<block.CollectionRef>`. Locking in the one-to-one naming rule first means the new types land cleanly instead of stacking a third convention alongside `RepeatableItem`/`Repeater` and `Image({ multiple })`/`MultipleAssets`.
