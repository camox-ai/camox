type SettingsContext = {
  settings?: Record<string, unknown> | null;
  itemSettings?: Record<string, unknown> | null;
};

export function contentToMarkdown(
  toMarkdown: readonly string[],
  schemaProperties: Record<string, any>,
  content: Record<string, unknown>,
  options: { insideList?: boolean } & SettingsContext = {},
): string {
  const { insideList = false, settings, itemSettings } = options;
  const parts: string[] = [];

  for (const line of toMarkdown) {
    const withoutConds = evaluateConditionals(line, { settings, itemSettings });
    if (withoutConds === null) continue;
    const resolved = resolveLine(withoutConds, schemaProperties, content, {
      settings,
      itemSettings,
    });
    if (resolved !== null) parts.push(resolved);
  }

  return parts.join(insideList ? "\n" : "\n\n");
}

/**
 * Evaluate `{{#if settings.X}}...{{/if}}` and `{{#if (eq settings.X "v")}}...{{/if}}` blocks
 * against the provided settings/itemSettings context. Returns the line with matching blocks
 * inlined and falsy blocks removed, or `null` if the whole line resolves to empty.
 *
 * Supports nested blocks by iterating inner-to-outer.
 */
const IF_BLOCK_RE =
  /\{\{#if (?:(settings|itemSettings)\.(\w+)|\(eq (settings|itemSettings)\.(\w+) "([^"]*)"\))\}\}((?:(?!\{\{#if ).)*?)\{\{\/if\}\}/s;

function evaluateConditionals(line: string, ctx: SettingsContext): string | null {
  let current = line;
  while (true) {
    const match = IF_BLOCK_RE.exec(current);
    if (!match) break;
    const [full, boolRoot, boolName, enumRoot, enumName, enumValue, body] = match;

    const root = boolRoot ?? enumRoot;
    const name = boolName ?? enumName;
    const source = root === "settings" ? ctx.settings : ctx.itemSettings;
    const value = source?.[name];

    const matched = enumValue === undefined ? Boolean(value) : value === enumValue;
    current =
      current.slice(0, match.index) +
      (matched ? body : "") +
      current.slice(match.index + full.length);
  }
  if (current === "") return null;
  return current;
}

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

function resolveLine(
  line: string,
  schemaProperties: Record<string, any>,
  content: Record<string, unknown>,
  ctx: SettingsContext,
): string | null {
  const placeholders = [...line.matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
  if (placeholders.length === 0) return line;

  const resolvedValues = placeholders.map((key) =>
    resolveField(schemaProperties[key], content[key], ctx),
  );
  if (resolvedValues.every((v) => !v)) return null;

  return line.replace(PLACEHOLDER_RE, (_match, key: string) => {
    return resolveField(schemaProperties[key], content[key], ctx) ?? "";
  });
}

function resolveField(schema: any, value: unknown, ctx: SettingsContext): string | undefined {
  if (value == null) return undefined;
  const fieldType: string | undefined = schema?.fieldType;

  if (fieldType === "String") {
    const text = String(value);
    if (!text) return undefined;
    return text;
  }

  if (fieldType === "Link") {
    const link = value as Record<string, unknown>;
    const text = link.text ?? "";
    const href = link.href ?? link.pageId ?? "";
    if (!text && !href) return undefined;
    return `[${text}](${href})`;
  }

  if (fieldType === "Image") {
    const img = value as Record<string, unknown>;
    const alt = img.alt ?? "";
    const filename = img.filename ?? "";
    return `![${alt}](${filename})`;
  }

  if (fieldType === "File") {
    const file = value as Record<string, unknown>;
    const filename = file.filename ?? "";
    const url = file.url ?? "";
    return `[${filename}](${url})`;
  }

  if (fieldType === "Embed") {
    const url = String(value);
    return url || undefined;
  }

  if (fieldType === "RepeatableItem") {
    if (!Array.isArray(value)) return undefined;
    const itemSchema = schema?.items?.properties;
    if (!itemSchema) return undefined;

    const itemToMarkdown: readonly string[] | undefined = schema?.toMarkdown;

    const itemParts: string[] = [];
    for (const item of value) {
      const isDbShape = item && typeof item === "object" && "content" in item;
      const itemContent = isDbShape ? (item as any).content : item;
      const itemSettings =
        isDbShape && "settings" in item
          ? (((item as any).settings as Record<string, unknown> | null | undefined) ?? null)
          : null;
      if (!itemContent || typeof itemContent !== "object") continue;

      let md: string;
      if (itemToMarkdown) {
        md = contentToMarkdown(itemToMarkdown, itemSchema, itemContent as Record<string, unknown>, {
          insideList: true,
          settings: ctx.settings,
          itemSettings,
        });
      } else {
        const fieldParts: string[] = [];
        for (const key of Object.keys(itemSchema)) {
          const resolved = resolveField(
            itemSchema[key],
            (itemContent as Record<string, unknown>)[key],
            { settings: ctx.settings, itemSettings },
          );
          if (resolved) fieldParts.push(resolved);
        }
        md = fieldParts.join(" — ");
      }
      if (!md) continue;

      const lines = md.split("\n");
      const listItem = [`- ${lines[0]}`, ...lines.slice(1).map((l) => `  ${l}`)].join("\n");
      itemParts.push(listItem);
    }
    return itemParts.length > 0 ? itemParts.join("\n") : undefined;
  }

  if (fieldType === "Boolean" || fieldType === "Enum") {
    return String(value);
  }

  return undefined;
}
