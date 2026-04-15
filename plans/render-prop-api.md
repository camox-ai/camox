# Replace Slot/asChild with render prop API in createBlock

## Goal

Remove `@radix-ui/react-slot` from `createBlock.tsx` and replace the implicit prop-merging pattern with an explicit render prop API where field renderers receive `(props, data)`.

This is part of a broader migration from Radix UI to Base UI. Changing `createBlock` is the hardest part because it's the public API that every block definition depends on.

## Motivation

- `Slot` relies on `cloneElement`, which React considers semi-deprecated and conflicts with RSC, the React Compiler, and strict TypeScript.
- The overlay styles have already been moved to CSS via data attributes (827dbf4), so `Slot` no longer needs to merge `style` — it only carries refs, data attributes, and event handlers. These all spread cleanly without merge conflicts.
- An explicit render prop is future-proof: adding new data (e.g. `isEditing`, `fieldError`) is a non-breaking change.

## New API design

Two arguments: `props` (spread onto the element) and `data` (read for logic).

- `props` contains everything that maps to HTML/React attributes: refs, data attributes, event handlers, and field-specific attributes like `to`, `src`, `alt`, `children`.
- `data` is an object for values that don't map directly to props — raw field values, flags, metadata. Optional today, but the object shape makes it future-proof.

### Field (String)

```tsx
// Before
<hero.Field name="title">
  {(content) => <h1 className="text-4xl">{content}</h1>}
</hero.Field>

// After
<hero.Field name="title">
  {(props) => <h1 {...props} className="text-4xl" />}
</hero.Field>
```

`props` includes `children` (ReactNode — the editor content or rendered markdown), `ref`, `data-camox-field-id`, `data-camox-hovered`, `data-camox-focused`, `data-camox-overlay-mode`, `onMouseEnter`, `onMouseLeave`.

When not in edit mode, `props` only contains `children` (the rendered markdown content), so spreading is still safe and zero-overhead.

### Link

```tsx
// Before
<hero.Link name="cta">
  {({ text, href, newTab }) => (
    <Link to={href} target={newTab ? "_blank" : undefined} rel={newTab ? "noreferrer" : undefined}>
      {text}
    </Link>
  )}
</hero.Link>

// After
<hero.Link name="cta">
  {(props) => <Link {...props} />}
</hero.Link>
```

`props` includes `to`, `target`, `rel`, `children` (the link text), plus editing props (`ref`, `contentEditable`, `data-camox-*`, `onInput`, `onFocus`, `onBlur`, `onMouseEnter`, `onMouseLeave`, `onKeyDown`, `spellCheck`, `suppressContentEditableWarning`).

The framework computes `target` and `rel` from `newTab`, and `to` from the resolved href — block authors no longer do this manually.

The second `data` argument exposes raw values for custom logic:

```tsx
<hero.Link name="cta">
  {(props, { href }) => <Link {...props} className={href === "/" ? "active" : ""} />}
</hero.Link>
```

`data` shape: `{ text: string, href: string, newTab: boolean }`.

### Image

```tsx
// Before
<hero.Image name="cover">
  {(img) => <img src={img.url} alt={img.alt} className="rounded" />}
</hero.Image>

// After
<hero.Image name="cover">
  {(props) => <img {...props} className="rounded" />}
</hero.Image>
```

`props` includes `src`, `alt`. Image currently uses a wrapper `<div>` for editing overlays instead of Slot, so this change is about the render function signature, not removing Slot.

The second `data` argument exposes the raw `ImageValue` for cases like background images:

```tsx
<hero.Image name="cover">
  {(_props, { url }) => <div style={{ backgroundImage: `url(${url})` }} />}
</hero.Image>
```

### File

```tsx
// Before
<hero.File name="doc">
  {(file) => <a href={file.url} download={file.filename}>Download</a>}
</hero.File>

// After
<hero.File name="doc">
  {(props) => <a {...props}>Download</a>}
</hero.File>
```

`props` includes `href`, `download` (filename). `data` exposes the raw `FileValue`.

### Embed

```tsx
// Before
<hero.Embed name="video">{(url) => <iframe src={url} />}</hero.Embed>

// After
<hero.Embed name="video">{(props) => <iframe {...props} />}</hero.Embed>
```

`props` includes `src`. `data` exposes `{ url: string }`.

### Repeater

The Repeater callback shape `(item, index)` does not change — it provides scoped components, not field values. But the scoped components (`item.Field`, `item.Link`, etc.) follow the same new `(props, data?)` signature:

```tsx
// Before
<hero.Repeater name="features">
  {(item) => (
    <div>
      <item.Field name="name">{(content) => <h3>{content}</h3>}</item.Field>
      <item.Link name="link">
        {({ text, href }) => <a href={href}>{text}</a>}
      </item.Link>
    </div>
  )}
</hero.Repeater>

// After
<hero.Repeater name="features">
  {(item) => (
    <div>
      <item.Field name="name">{(props) => <h3 {...props} />}</item.Field>
      <item.Link name="link">{(props) => <Link {...props} />}</item.Link>
    </div>
  )}
</hero.Repeater>
```

Nested repeaters work the same way recursively.

### Detached

```tsx
// Before
<block.Detached>
  <nav className="fixed top-0">...</nav>
</block.Detached>

// After
<block.Detached>
  {(props) => <nav {...props} className="fixed top-0">...</nav>}
</block.Detached>
```

`props` includes `ref`, `onClick`, `onMouseEnter`, `onMouseLeave`.

## Implementation steps

### 1. Update internal Field component

In `createBlock.tsx`, change `Field` to build a `props` object and pass it through the render function instead of wrapping in `<Slot>`:

```tsx
// Before
return (
  <Slot ref={elementRef} data-camox-field-id={fieldId} ...>
    {children(editorContent)}
  </Slot>
);

// After
const fieldProps = {
  ref: elementRef,
  'data-camox-field-id': fieldId,
  'data-camox-hovered': isHovered || undefined,
  'data-camox-focused': isFocused || undefined,
  'data-camox-overlay-mode': mode === 'layout' ? 'layout' : undefined,
  onMouseEnter: handleMouseEnter,
  onMouseLeave: handleMouseLeave,
  children: editorContent,
};
return <>{children(fieldProps)}</>;
```

Non-editable path:

```tsx
const fieldProps = { children: markdownToReactNodes(fieldValue) };
return <>{children(fieldProps)}</>;
```

### 2. Update internal Link component

Build props including `to`, `target`, `rel`, `children`, editing attributes. Replace `<Slot>` with passing props through the render function. Keep `<PopoverAnchor asChild>` as-is — it stays on Radix until the broader Popover migration to Base UI. Pass `(props, data)` where `data = { text, href, newTab }`.

### 3. Update internal Image component

Image doesn't use Slot (it already wraps with a `<div>` for overlays). The only change is the render function signature: from `(image: ImageValue)` to `(props, data)` where `props = { src, alt }` and `data` is the raw `ImageValue`.

### 4. Update internal File component

Change from `(file: FileValue)` to `(props, data)` where `props = { href, download }` and `data` is the raw `FileValue`.

### 5. Update internal Embed component

Change from `(url: string)` to `(props, data)` where `props = { src }` and `data = { url }`.

### 6. Update Detached component

Change from `children: ReactNode` to `children: (props) => ReactNode`. Build props from the current Slot attributes.

### 7. Update Repeater type signatures

Update the `children` callback types for all scoped components (`item.Field`, `item.Link`, etc.) to match the new signatures — both the top-level typed versions and the nested `any`-typed versions.

### 8. Update all block definitions

Every block in `apps/playground/src/camox/blocks/`, `packages/cli/template/src/camox/blocks/`, and any other block files need to be updated to the new render function signatures.

### 9. Update the camox-block skill

Update `packages/sdk/skills/camox-block/SKILL.md` to document the new API.

### 10. Remove @radix-ui/react-slot from packages/sdk

Remove the import and the dependency from `package.json`.

## Decisions

- **PopoverAnchor in Link**: Keep using Radix's `<PopoverAnchor asChild>` for now. Will be replaced when Popover migrates to Base UI separately.
- **`data` typing**: No exported types. Keep implicit via render function inference — TypeScript infers the shapes from the generic field type parameters already.
