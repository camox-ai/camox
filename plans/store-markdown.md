# Store Markdown Instead of Lexical JSON

## Context

`Type.String` fields currently store Lexical editor state JSON in the database. This causes three problems:

1. **DB clutter** — a simple "Hello **world**" is ~20 lines of JSON
2. **Schema divergence** — `Type.String()` declares `type: "string"` but the default is a Lexical object
3. **AI friction** — AI generates markdown → convert to Lexical → for SEO convert back to markdown

After this migration, the DB stores plain markdown strings. The Lexical editor converts at its boundary (markdown→Lexical on load, Lexical→markdown on save).

## Approach

Move the conversion layer from the **storage boundary** to the **editor boundary**. The DB, API, AI, and rendering all work with markdown strings. Only the Lexical editor components deal with Lexical JSON, converting on mount/save.

## Files to modify

### `apps/api` (5 changes)

| File                          | Change                                                                                                                                                                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/seed.ts`          | Replace all `plainTextToLexicalState("...")` calls with plain strings. Remove import.                                                                                                                                                                       |
| `src/routes/pages.ts`         | **L339-340**: `DEFAULT_HERO_BLOCK` — use plain strings instead of `plainTextToLexicalState(...)`. **L552**: Remove `markdownToLexicalState` conversion of AI output — AI already returns markdown, just store it. Remove both imports from `lexical-state`. |
| `src/lib/content-markdown.ts` | `resolveField` for `fieldType === "String"`: remove `isLexicalState` check — value is already a markdown string. Remove import of lexical utils.                                                                                                            |
| `src/lib/lexical-state.ts`    | Can keep for now (SDK still uses some utils), but API no longer imports from it.                                                                                                                                                                            |

### `packages/sdk` (6 changes)

| File                                                   | Change                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/lib/contentType.ts`                          | `Type.String()`: change `default: plainTextToLexicalState(options.default)` → `default: options.default`. Remove import.                                                                                                                                                                                                                                                                                               |
| `src/core/lib/lexicalReact.tsx`                        | Replace `lexicalStateToReactNodes` with a `markdownToReactNodes` function that parses markdown (bold/italic) into React nodes directly. No Lexical dependency.                                                                                                                                                                                                                                                         |
| `src/core/createBlock.tsx`                             | Update import: `lexicalStateToReactNodes` → `markdownToReactNodes`. Call site at L649 stays the same shape.                                                                                                                                                                                                                                                                                                            |
| `src/core/lib/fieldTypes.tsx`                          | `String.getLabel`: remove `isLexicalState` check — value is a string, just return it (strip markdown for label display). Remove import.                                                                                                                                                                                                                                                                                |
| `src/core/components/lexical/editorConfig.ts`          | `normalizeLexicalState`: update to handle markdown strings by converting via `markdownToLexicalState`. If value is already Lexical JSON (for backwards compat during transition), keep current behavior.                                                                                                                                                                                                               |
| `src/features/preview/components/ItemFieldsEditor.tsx` | **SidebarLexicalEditor integration**: The editor receives markdown, so the value passed needs converting. Update `defaultValues` logic — remove `isLexicalState` guard; pass markdown string as-is (editorConfig.ts handles conversion). Remove `plainTextToLexicalState` import. The `SidebarLexicalEditor.onChange` returns Lexical JSON — add a `lexicalStateToMarkdown` conversion before calling `onFieldChange`. |
| `src/core/components/lexical/InlineLexicalEditor.tsx`  | Same pattern: `onChange` callback should convert Lexical state → markdown before propagating. `initialState`/`externalState` are now markdown strings — `editorConfig.ts` handles the load conversion.                                                                                                                                                                                                                 |

### `packages/sdk` — files that may need updating for save path

| File                                                   | Change                                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `src/core/components/lexical/SidebarLexicalEditor.tsx` | `handleChange`: convert `editorState.toJSON()` → markdown via `lexicalStateToMarkdown` before calling `onChange`. |

## Reuse

| Utility                                 | File                                           | Purpose                                    |
| --------------------------------------- | ---------------------------------------------- | ------------------------------------------ |
| `markdownToLexicalState`                | `packages/sdk/src/core/lib/lexicalState.ts`    | Editor load: markdown → Lexical JSON       |
| `lexicalStateToMarkdown`                | `packages/sdk/src/core/lib/lexicalState.ts`    | Editor save: Lexical JSON → markdown       |
| `isLexicalState`                        | `packages/sdk/src/core/lib/lexicalState.ts`    | Backwards compat detection in editorConfig |
| `FORMAT_FLAGS`, `lexicalTextToMarkdown` | `packages/sdk/src/core/lib/modifierFormats.ts` | Already used by markdown conversion        |

## Steps

- [ ] **1. `contentType.ts`** — `Type.String()` default: store plain string instead of Lexical object
- [ ] **2. `seed.ts`** — Replace all 10 `plainTextToLexicalState(...)` calls with plain strings. Remove import.
- [ ] **3. `pages.ts`** — `DEFAULT_HERO_BLOCK`: use plain strings. Remove `markdownToLexicalState` conversion of AI output (L552 block). Remove imports.
- [ ] **4. `content-markdown.ts`** — Simplify `resolveField` for String: value is already markdown, just return it. Remove lexical imports.
- [ ] **5. `lexicalReact.tsx`** — Rewrite as `markdownToReactNodes`: parse `**bold**`, `*italic*` into `<strong>`/`<em>` React nodes. ~30 lines.
- [ ] **6. `createBlock.tsx`** — Update import to use `markdownToReactNodes`.
- [ ] **7. `fieldTypes.tsx`** — `String.getLabel`: strip markdown syntax for display (e.g. remove `**`/`*`). Remove lexical imports.
- [ ] **8. `editorConfig.ts`** — `normalizeLexicalState`: if value is a plain string (not Lexical JSON), convert via `markdownToLexicalState`. Keep `isLexicalState` check for backwards compat.
- [ ] **9. `SidebarLexicalEditor.tsx`** — `handleChange`: convert Lexical JSON → markdown via `lexicalStateToMarkdown` before calling `onChange`.
- [ ] **10. `InlineLexicalEditor.tsx`** — Same: convert Lexical JSON → markdown in `handleChange` before calling `onChange`.
- [ ] **11. `ItemFieldsEditor.tsx`** — Remove `isLexicalState`/`plainTextToLexicalState` usage in `defaultValues`. Value is already a markdown string. Pass directly.

## Verification

- [ ] Run `pnpm build` / `pnpm typecheck` across the monorepo
- [ ] Run existing tests
- [ ] Seed the DB (`POST /seed`) and verify String fields are stored as plain strings (not Lexical JSON)
- [ ] Open the editor, edit a String field with bold/italic — verify it saves as markdown (`**bold**`)
- [ ] Verify inline preview rendering shows bold/italic correctly
- [ ] Verify AI page generation stores markdown strings directly
- [ ] Verify SEO generation reads content correctly (no double-conversion)
