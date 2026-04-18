## toMarkdown Builder API

### Goal

Replace the current `string[]` template format for `toMarkdown` with a typed builder function that uses proxied content references and template literals. This gives block authors full autocomplete and type-checking while still producing serializable output for the database.

### Current State

- `toMarkdown` is a `string[]` with `{{fieldName}}` placeholders, joined with `\n\n` at render time.
- Placeholder names are validated against `content` keys at the type level using template literal types.
- Lines where all placeholders resolve to empty are omitted.
- No support for conditional logic based on settings — the format is purely interpolation.
- The custom `{{fieldName}}` resolver is hand-maintained.

### Target API

```ts
toMarkdown: (c) => [`# ${c.title}`, c.description, c.illustration, c.cta];
```

`c` is a `Proxy` whose property accesses return `FieldToken` objects. Each `FieldToken` has a `toString()` that returns `"{{fieldName}}"`, so when used inside a template literal it produces the same Handlebars-compatible output as today. When used bare (not in a template literal), the token is kept as-is in the array and resolved at render time.

The return type is `(string | FieldToken)[]`. Each entry becomes a paragraph (joined with `\n\n`), same as today.

### Examples

**Simple hero:**

```ts
toMarkdown: (c) => [`# ${c.title}`, c.description, c.illustration, c.cta];
```

**Testimonial with combined fields:**

```ts
toMarkdown: (c) => [`> ${c.quote}`, `— ${c.author}, ${c.jobTitle}, ${c.company}`];
```

**Statistics with RepeatableItem:**

```ts
toMarkdown: (c) => [`## ${c.subtitle}`, c.description, c.statistics];

// And on the RepeatableItem itself:
statistics: Type.RepeatableItem(
  {
    number: Type.String({ default: "100M+" }),
    label: Type.String({ default: "pages served" }),
  },
  {
    minItems: 4,
    maxItems: 8,
    toMarkdown: (c) => [`**${c.number}** — ${c.label}`],
  },
);
```

**Footer with nested repeaters:**

```ts
toMarkdown: (c) => [c.logo, c.tagline, c.columns, c.copyright];
```

Template literals are only needed when combining fields or adding markdown syntax. A bare `c.fieldName` is the default for single-field lines.

### Typing

The proxy `c` is typed as `{ [K in keyof Content]: FieldToken }`. Accessing a property that doesn't exist in the content schema is a type error:

```ts
c.title; // ✅ if "title" is in content
c.titl; // ❌ type error
```

When used in a template literal, `FieldToken.toString()` fires and produces a string — TypeScript is happy because `string` is valid in template expressions. When used bare, the array type accepts `FieldToken` directly.

### Serialization

The `toMarkdown` function runs **once at block registration time** (when the block definition is loaded). It receives the proxy, produces an array of strings and tokens, which is then serialized to the same `string[]` format stored in the database. The function itself is never stored — only its output.

This means:

- Database format doesn't change (still `string[]` with `{{fieldName}}` placeholders)
- Server-side markdown generation doesn't change
- The function is a developer-time convenience that compiles away

### Implementation Steps

1. **Create `FieldToken` class** with `toString()` returning `"{{fieldName}}"` and a `fieldName` property for direct inspection.

2. **Create content proxy factory.** Given a content schema, return a `Proxy` that returns `new FieldToken(key)` for any property access, typed as `{ [K in keyof Content]: FieldToken }`.

3. **Create `resolveToMarkdown` function.** Accepts the `toMarkdown` function from a block definition, runs it with the proxy, and flattens the result to `string[]` — replacing bare `FieldToken` entries with their `toString()` value.

4. **Update `createBlock` to accept the new format.** The `toMarkdown` option changes from `string[]` to `(c: ContentProxy) => (string | FieldToken)[]`. Run `resolveToMarkdown` at registration time and store the result.

5. **Update RepeatableItem** to accept the same function signature for its `toMarkdown` option.

6. **Update type-level validation.** Remove the template literal type parsing that currently extracts `{{fieldName}}` from strings. The proxy handles type safety now.

7. **Update SKILL.md** with the new API and examples.

8. **Migrate all existing block definitions** from `string[]` to the builder function.

---

## Phase 2: Settings Conditionals

Once the base builder API is in place, introduce a second proxy argument for settings-based conditional logic.

### Target API

```ts
// Boolean setting:
toMarkdown: (c, s) => [`# ${c.title}`, c.description, s.showCta(c.cta)];

// Boolean setting wrapping multiple lines:
toMarkdown: (c, s) => [
  `# ${c.title}`,
  s.showDetails([c.subtitle, c.description, c.backgroundImage]),
  c.cta,
];

// Enum setting with variant matching:
toMarkdown: (c, s) => [
  `# ${c.title}`,
  s.variant("banner", [`**${c.headline}** — ${c.subtext}`, c.cta]),
  s.variant("inline", [`${c.headline}: ${c.cta}`]),
];
```

### Typing

The `s` proxy is derived from the `settings` schema:

- **Boolean settings** become callable: `s.showCta(lines: string | FieldToken | (string | FieldToken)[]) => Conditional`
- **Enum settings** become callable with a value: `s.variant(value: "banner" | "inline", lines: ...) => Conditional`

Invalid setting names or enum values are type errors.

### Serialization

`Conditional` tokens serialize to Handlebars block syntax:

- `s.showCta(c.cta)` → `"{{#if settings.showCta}}{{cta}}{{/if}}"`
- `s.variant("banner", [...])` → `"{{#if settings.variant.banner}}...{{/if}}"`

The server-side resolver switches from the current custom placeholder logic to Handlebars template evaluation (e.g. `handlebars.compile()`). This is a non-breaking change for Phase 1 output since `{{fieldName}}` is already valid Handlebars.

### Return Type Update

The array return type widens from `(string | FieldToken)[]` to `(string | FieldToken | Conditional)[]`. All Phase 1 blocks remain valid — this is purely additive.

### Implementation Steps

1. **Create `Conditional` class** that holds condition info (setting name, optional enum value) and child lines. Serializes to Handlebars `{{#if}}` blocks.

2. **Create settings proxy factory.** Given a settings schema, return a `Proxy` where boolean keys are callable `(lines) => Conditional` and enum keys are callable `(value, lines) => Conditional`.

3. **Update `resolveToMarkdown`** to handle `Conditional` tokens — flatten them into Handlebars block syntax in the output `string[]`.

4. **Switch server-side markdown resolver from custom interpolation to Handlebars.** Since Phase 1 output is already Handlebars-compatible, this can happen at any point after Phase 1.

5. **Update `createBlock` signature** to accept the optional second argument: `(c: ContentProxy, s: SettingsProxy) => ...`

6. **Update SKILL.md** with conditional examples.
