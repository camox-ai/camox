import { ORPCError } from "@orpc/server";
import { generateKeyBetween } from "fractional-indexing";

export type BlockItemSeed = {
  tempId: string;
  parentTempId: string | null;
  fieldName: string;
  content: unknown;
  position: string;
};

type SchemaProps = Record<string, FieldSchema>;
type FieldSchema = {
  fieldType?: string;
  items?: { properties?: SchemaProps };
};

function badRequest(message: string, field: string): never {
  throw new ORPCError("BAD_REQUEST", { message, data: { field } });
}

/**
 * Normalize block content for createBlock: walks `content` guided by the block
 * definition's `contentSchema`, extracts inline arrays on RepeatableItem fields
 * into seeds (recursively, with `parentTempId` for nested repeaters), and returns
 * content stripped of those fields. The `repeatable_items` table is the source
 * of truth — `getBlock` re-injects `_itemId` markers on read.
 *
 * Seeds are returned in topological order (parents before children) so the
 * existing seed-insertion loop in createBlock can resolve `parentTempId` via
 * `tempIdToRealId`.
 */
export function normalizeBlockContent(
  rawContent: unknown,
  contentSchema: unknown,
): { content: Record<string, unknown>; seeds: BlockItemSeed[] } {
  const schemaProps = (contentSchema as { properties?: SchemaProps } | null)?.properties;
  const ctx = { counter: { v: 0 }, seeds: [] as BlockItemSeed[] };
  const content = walk(rawContent, schemaProps, null, ctx);
  return { content, seeds: ctx.seeds };
}

function walk(
  rawContent: unknown,
  schemaProps: SchemaProps | undefined,
  parentTempId: string | null,
  ctx: { counter: { v: number }; seeds: BlockItemSeed[] },
): Record<string, unknown> {
  if (rawContent == null || typeof rawContent !== "object" || Array.isArray(rawContent)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawContent as Record<string, unknown>)) {
    const fieldSchema = schemaProps?.[key];
    if (fieldSchema?.fieldType === "RepeatableItem") {
      if (value == null) continue;
      if (!Array.isArray(value)) {
        badRequest(`Field "${key}" is repeatable; expected an array`, key);
      }
      const itemSchemaProps = fieldSchema.items?.properties;
      let prevPos: string | null = null;
      for (const element of value) {
        if (element == null || typeof element !== "object" || Array.isArray(element)) {
          badRequest(`Field "${key}" element must be an object`, key);
        }
        if ("_itemId" in (element as object)) {
          badRequest(
            `Field "${key}" contains an _itemId marker; cannot reference existing items during create`,
            key,
          );
        }
        const tempId = `__auto_${ctx.counter.v++}`;
        const position = generateKeyBetween(prevPos, null);
        // Push parent before recursing so child seeds appear after their parent (topological order).
        const seed: BlockItemSeed = {
          tempId,
          parentTempId,
          fieldName: key,
          content: {},
          position,
        };
        ctx.seeds.push(seed);
        seed.content = walk(element, itemSchemaProps, tempId, ctx);
        prevPos = position;
      }
      continue;
    }
    out[key] = value;
  }
  return out;
}
