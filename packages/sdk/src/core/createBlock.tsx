import { useFrame } from "@camox/ui/frame";
import { Input } from "@camox/ui/input";
import { Kbd } from "@camox/ui/kbd";
import { Label } from "@camox/ui/label";
import { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from "@camox/ui/popover";
import { toast } from "@camox/ui/toaster";
import { Slot } from "@radix-ui/react-slot";
import { Type as TypeBoxType, type TSchema, type Static } from "@sinclair/typebox";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSelector } from "@xstate/store/react";
import { generateKeyBetween } from "fractional-indexing";
import * as React from "react";
import { createPortal } from "react-dom";

import { useIsPreviewSheetOpen } from "@/features/preview/components/PreviewSideSheet.tsx";
import { blockMutations, repeatableItemMutations, type Page, pageQueries } from "@/lib/queries";

import {
  OVERLAY_WIDTHS,
  OVERLAY_OFFSETS,
  OVERLAY_COLORS,
  LAYOUT_OVERLAY_COLORS,
} from "../features/preview/overlayConstants";
import { postOverlayMessage } from "../features/preview/overlayMessages";
import { previewStore } from "../features/preview/previewStore";
import {
  useNormalizedData,
  isFileMarker,
  isItemMarker,
  resolveFileMarker,
} from "../lib/normalized-data";
import { AddBlockControlBar } from "./components/AddBlockControlBar.tsx";
import { InlineLexicalEditor } from "./components/lexical/InlineLexicalEditor";
import { useFieldSelection } from "./hooks/useFieldSelection.ts";
import { useIsEditable } from "./hooks/useIsEditable.ts";
import { useOverlayMessage } from "./hooks/useOverlayMessage.ts";
import {
  Type,
  type EmbedURL,
  type LinkValue,
  type ImageValue,
  type FileValue,
  type ExtractAllPlaceholders,
} from "./lib/contentType.ts";
import { markdownToReactNodes } from "./lib/lexicalReact";

export { Type };

/** Normalize legacy links (no `type` field) to the new union shape */
const normalizeLinkValue = (value: Record<string, unknown>): LinkValue => {
  if (!value.type) {
    return { type: "external", ...value } as LinkValue;
  }
  return value as LinkValue;
};

/** Resolve a LinkValue to an href string */
const resolveLinkHref = (
  link: LinkValue,
  pages: Array<{ id: number; fullPath: string }> | undefined,
): string => {
  if (link.type === "page") {
    const page = pages?.find((p) => String(p.id) === link.pageId);
    return page?.fullPath ?? "#";
  }
  return link.href;
};

let hasShownEmbedLockToast = false;

/* -------------------------------------------------------------------------------------------------
 * createBlock
 * -----------------------------------------------------------------------------------------------*/

interface CreateBlockOptions<
  TSchemaShape extends Record<string, TSchema> = Record<string, TSchema>,
  TSettingsShape extends Record<string, TSchema> = Record<string, TSchema>,
  TMarkdown extends readonly string[] = readonly string[],
> {
  id: string;
  /**
   * Human-readable title for the block (JSON Schema `title`).
   */
  title: string;
  /**
   * Description for AI agents on when and how to use this block (JSON Schema `description`).
   * This should describe the block's purpose, typical use cases, and any important
   * considerations for placement or configuration.
   */
  description: string;
  /**
   * Schema defining the structure of the block's editable content.
   * All fields must have default values.
   * Use Type.String() and Type.RepeatableItem() to define the schema.
   *
   * @example
   * content: {
   *   title: Type.String({ default: 'Hello' }),
   *   items: Type.RepeatableItem({
   *     name: Type.String({ default: 'Item' })
   *   }, { minItems: 1, maxItems: 10 })
   * }
   */
  content: TSchemaShape;
  /**
   * Template for rendering block content as markdown.
   * Each line is joined with `\n\n`. Use `{{fieldName}}` placeholders for field values.
   * Lines where all placeholders resolve to empty are omitted.
   *
   * @example
   * toMarkdown: ["# {{title}}", "{{description}}", "{{illustration}}", "{{cta}}"]
   */
  toMarkdown: [ExtractAllPlaceholders<TMarkdown>] extends [Extract<keyof TSchemaShape, string>]
    ? TMarkdown
    : readonly [
        `Invalid toMarkdown placeholder {{${Exclude<ExtractAllPlaceholders<TMarkdown>, Extract<keyof TSchemaShape, string>>}}}`,
      ];
  /**
   * Optional schema defining block-level settings (e.g. layout variant, toggles).
   * Settings are not inline-editable; they use Type.Enum() and Type.Boolean().
   *
   * @example
   * settings: {
   *   alignment: Type.Enum({ default: 'left', options: { left: 'Left', center: 'Center' } }),
   *   showBackground: Type.Boolean({ default: true })
   * }
   */
  settings?: TSettingsShape;
  /**
   * When true, this block can only be used inside layouts and won't appear in the AddBlockSheet
   * or be available for AI page generation.
   */
  layoutOnly?: boolean;
  /**
   * React component that renders the block.
   * Must be defined as a separate function (not inline, not an arrow function).
   * Should use the Field component returned by createBlock to render editable content.
   */
  component: React.ComponentType<{
    content: Static<ReturnType<typeof TypeBoxType.Object<TSchemaShape>>>;
  }>;
}

interface BlockData<TContent> {
  _id: string;
  type: string;
  content: TContent;
  settings?: Record<string, unknown>;
  position: string;
}

export interface BlockComponentProps<TContent> {
  blockData: BlockData<TContent>;
  mode: "site" | "peek" | "layout";
  isFirstBlock?: boolean;
  showAddBlockTop?: boolean;
  showAddBlockBottom?: boolean;
  addBlockAfterPosition?: string | null;
}

/* -------------------------------------------------------------------------------------------------
 * Peek bundle helpers — generate fake normalized data for block previews
 * -----------------------------------------------------------------------------------------------*/

export interface PeekItem {
  id: number;
  blockId: number;
  parentItemId: number | null;
  fieldName: string;
  content: unknown;
  summary: string;
  position: string;
  createdAt: number;
  updatedAt: number;
}

export interface RepeatableItemSeed {
  tempId: string;
  parentTempId: string | null;
  fieldName: string;
  content: Record<string, unknown>;
  position: string;
}

/**
 * Recursively walks schema properties to generate RepeatableItemSeed objects.
 * Sets `_itemId` placeholder markers on `content` for each repeatable field,
 * and pushes seed objects into `allSeeds`.
 */
function buildInitialSeeds(
  properties: Record<string, any>,
  parentTempId: string | null,
  content: Record<string, unknown>,
  allSeeds: RepeatableItemSeed[],
  counter: { value: number },
) {
  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    if (fieldSchema.type !== "array" || !fieldSchema.items?.properties) continue;
    const defaultCount = fieldSchema.defaultItems ?? fieldSchema.minItems ?? 0;
    if (defaultCount <= 0) continue;

    const itemProperties = fieldSchema.items.properties as Record<string, any>;

    // Build default item content, excluding nested repeatable sub-fields
    const itemContent: Record<string, unknown> = {};
    for (const [propName, propSchema] of Object.entries(itemProperties)) {
      if (propSchema.type === "array" && propSchema.items?.properties) continue;
      if ("default" in propSchema) {
        itemContent[propName] = propSchema.default;
      }
    }

    const markers: { _itemId: string }[] = [];
    let prevPosition: string | null = null;

    for (let i = 0; i < defaultCount; i++) {
      const tempId = `seed_${++counter.value}`;
      const position = generateKeyBetween(prevPosition, null);
      prevPosition = position;

      allSeeds.push({
        tempId,
        parentTempId,
        fieldName,
        content: { ...itemContent },
        position,
      });

      markers.push({ _itemId: tempId });

      // Recurse into nested repeatable fields within this item.
      // Use a throwaway object so nested _itemId markers don't pollute the seed's stored content.
      const nestedDiscard: Record<string, unknown> = {};
      buildInitialSeeds(itemProperties, tempId, nestedDiscard, allSeeds, counter);
    }

    content[fieldName] = markers;
  }
}

/**
 * Recursively walks schema properties to generate fake repeatable items for peek mode.
 * Sets `_itemId` markers on `content` for each repeatable field,
 * and pushes the corresponding fake items into `allItems`.
 */
function buildPeekItems(
  properties: Record<string, any>,
  blockId: number,
  parentItemId: number | null,
  content: Record<string, unknown>,
  allItems: PeekItem[],
  counter: { value: number },
) {
  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    if (fieldSchema.type !== "array" || !fieldSchema.items?.properties) continue;
    const defaultCount = fieldSchema.defaultItems ?? fieldSchema.minItems ?? 0;
    if (defaultCount <= 0) continue;

    const itemProperties = fieldSchema.items.properties as Record<string, any>;

    // Build default item content, excluding nested repeatable sub-fields
    const itemContent: Record<string, unknown> = {};
    for (const [propName, propSchema] of Object.entries(itemProperties)) {
      if (propSchema.type === "array" && propSchema.items?.properties) continue;
      if ("default" in propSchema) {
        itemContent[propName] = propSchema.default;
      }
    }

    const markers: { _itemId: number }[] = [];
    let prevPosition: string | null = null;

    for (let i = 0; i < defaultCount; i++) {
      const itemId = --counter.value;
      const position = generateKeyBetween(prevPosition, null);
      prevPosition = position;

      allItems.push({
        id: itemId,
        blockId,
        parentItemId,
        fieldName,
        content: { ...itemContent },
        summary: "",
        position,
        createdAt: 0,
        updatedAt: 0,
      });

      markers.push({ _itemId: itemId });

      // Recurse into nested repeatable fields within this item
      const nestedContent: Record<string, unknown> = {};
      buildPeekItems(itemProperties, blockId, itemId, nestedContent, allItems, counter);

      // Merge nested _itemId markers into the item's content
      const item = allItems.find((it) => it.id === itemId)!;
      item.content = { ...(item.content as Record<string, unknown>), ...nestedContent };
    }

    content[fieldName] = markers;
  }
}

export function createBlock<
  TSchemaShape extends Record<string, TSchema>,
  TSettingsShape extends Record<string, TSchema> = Record<string, never>,
  const TMarkdown extends readonly string[] = readonly string[],
>(options: CreateBlockOptions<TSchemaShape, TSettingsShape, TMarkdown>) {
  // Build TypeBox schema for runtime validation and default value creation
  const typeboxSchema = TypeBoxType.Object(options.content);

  // Build a richer JSON Schema object
  const contentSchema = {
    type: "object" as const,
    title: options.title,
    description: options.description,
    properties: typeboxSchema.properties,
    required: Object.keys(options.content),
    toMarkdown: options.toMarkdown as readonly string[],
  };

  // Build settings schema (if provided)
  const settingsTypeboxSchema = options.settings ? TypeBoxType.Object(options.settings) : null;

  const settingsSchema = settingsTypeboxSchema
    ? {
        type: "object" as const,
        properties: settingsTypeboxSchema.properties,
        required: Object.keys(options.settings!),
      }
    : undefined;

  // Extract defaults manually since Value.Create doesn't support Unsafe types (used by Type.Enum and Type.Embed)
  const contentDefaults: Record<string, unknown> = {};
  const contentDefaultsForStorage: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(typeboxSchema.properties)) {
    if ("default" in prop) {
      contentDefaults[key] = prop.default;
      // Exclude asset fields and repeatable arrays from storage defaults —
      // assets use placeholders at the rendering layer, repeatables are stored as separate DB rows
      const ft = (prop as any).fieldType;
      const ait = (prop as any).arrayItemType;
      if (
        ft === "Image" ||
        ft === "File" ||
        ft === "RepeatableItem" ||
        ait === "Image" ||
        ait === "File"
      ) {
        continue;
      }
      contentDefaultsForStorage[key] = prop.default;
    }
  }

  // Extract per-item defaults for repeatable (array) fields
  const repeatableItemDefaults: Record<string, Record<string, unknown>> = {};
  for (const [key, prop] of Object.entries(typeboxSchema.properties)) {
    const p = prop as any;
    if (p.type === "array" && p.items?.properties) {
      const itemDefaults: Record<string, unknown> = {};
      for (const [itemKey, itemProp] of Object.entries(p.items.properties)) {
        if (itemProp && typeof itemProp === "object" && "default" in itemProp) {
          itemDefaults[itemKey] = (itemProp as any).default;
        }
      }
      if (Object.keys(itemDefaults).length > 0) {
        repeatableItemDefaults[key] = itemDefaults;
      }
    }
  }

  const settingsDefaults: Record<string, unknown> = {};
  if (settingsTypeboxSchema) {
    for (const [key, prop] of Object.entries(settingsTypeboxSchema.properties)) {
      if ("default" in prop) {
        settingsDefaults[key] = prop.default;
      }
    }
  }

  type TContent = Static<typeof typeboxSchema>;
  type TSettings =
    TSettingsShape extends Record<string, never>
      ? Record<string, never>
      : Static<ReturnType<typeof TypeBoxType.Object<TSettingsShape>>>;

  type BlockContextValue = {
    blockId: string;
    content: TContent;
    settings: TSettings;
    isHovered: boolean;
    setIsHovered: React.Dispatch<React.SetStateAction<boolean>>;
  } & Pick<BlockComponentProps<TContent>, "mode">;

  interface RepeaterItemContextValue {
    arrayFieldName: string;
    itemIndex: number;
    itemContent: any;
    itemId?: string;
  }

  const Context = React.createContext<BlockContextValue | null>(null);
  const RepeaterItemContext = React.createContext<RepeaterItemContextValue | null>(null);

  // Context to track if the parent repeater container is being hovered from sidebar
  const RepeaterHoverContext = React.createContext<boolean>(false);

  /**
   * Build a field ID that matches the sidebar's `getFieldId` format.
   * Root fields:          blockId__fieldName
   * Repeater item fields: blockId__itemId__fieldName
   */
  const getOverlayFieldId = (
    blockId: string,
    repeaterContext: RepeaterItemContextValue | null,
    fieldName: string,
  ): string => {
    if (repeaterContext?.itemId) {
      return `${blockId}__${repeaterContext.itemId}__${fieldName}`;
    }
    return `${blockId}__${fieldName}`;
  };

  // Only allow string fields - not objects, arrays, or embed URLs
  type StringFields = {
    [K in keyof TContent as TContent[K] extends EmbedURL
      ? never
      : TContent[K] extends string
        ? K
        : never]: TContent[K];
  };

  // Only allow embed URL fields
  type EmbedFields = {
    [K in keyof TContent as TContent[K] extends EmbedURL ? K : never]: TContent[K];
  };

  // Only allow link fields
  type LinkFields = {
    [K in keyof TContent as TContent[K] extends LinkValue ? K : never]: TContent[K];
  };

  // Only allow image fields
  type ImageFields = {
    [K in keyof TContent as ImageValue extends TContent[K]
      ? TContent[K] extends ImageValue
        ? K
        : never
      : never]: TContent[K];
  };

  // Only allow file fields
  type FileFields = {
    [K in keyof TContent as FileValue extends TContent[K]
      ? TContent[K] extends FileValue
        ? K
        : never
      : never]: TContent[K];
  };

  // Only allow array fields (from RepeatableItem)
  type RepeatableFields = {
    [K in keyof TContent as TContent[K] extends Array<any> ? K : never]: TContent[K];
  };

  // Extract the element type from a repeatable array field
  type RepeatableItemType<K extends keyof RepeatableFields> =
    RepeatableFields[K] extends Array<infer U> ? U : never;

  // Extract string fields from a repeatable item type
  type ItemStringFields<K extends keyof RepeatableFields> = {
    [F in keyof RepeatableItemType<K> as RepeatableItemType<K>[F] extends string
      ? F
      : never]: RepeatableItemType<K>[F];
  };

  // Extract link fields from a repeatable item type
  type ItemLinkFields<K extends keyof RepeatableFields> = {
    [F in keyof RepeatableItemType<K> as RepeatableItemType<K>[F] extends LinkValue
      ? F
      : never]: RepeatableItemType<K>[F];
  };

  // Extract embed URL fields from a repeatable item type
  type ItemEmbedFields<K extends keyof RepeatableFields> = {
    [F in keyof RepeatableItemType<K> as RepeatableItemType<K>[F] extends EmbedURL
      ? F
      : never]: RepeatableItemType<K>[F];
  };

  // Extract image fields from a repeatable item type
  type ItemImageFields<K extends keyof RepeatableFields> = {
    [F in keyof RepeatableItemType<K> as ImageValue extends RepeatableItemType<K>[F]
      ? RepeatableItemType<K>[F] extends ImageValue
        ? F
        : never
      : never]: RepeatableItemType<K>[F];
  };

  // Extract file fields from a repeatable item type
  type ItemFileFields<K extends keyof RepeatableFields> = {
    [F in keyof RepeatableItemType<K> as FileValue extends RepeatableItemType<K>[F]
      ? RepeatableItemType<K>[F] extends FileValue
        ? F
        : never
      : never]: RepeatableItemType<K>[F];
  };

  // Extract repeatable array fields from a repeatable item type
  type ItemRepeatableFields<K extends keyof RepeatableFields> = {
    [F in keyof RepeatableItemType<K> as RepeatableItemType<K>[F] extends Array<any>
      ? F
      : never]: RepeatableItemType<K>[F];
  };

  const Field = <K extends keyof StringFields>({
    name,
    children,
  }: {
    name: K;
    children: (content: React.ReactNode) => React.ReactNode;
  }) => {
    const blockContext = React.use(Context);
    if (!blockContext) {
      throw new Error("Field must be used within a Block Component");
    }

    const { blockId, content, mode } = blockContext;
    const isContentEditable = useIsEditable(mode);
    const colors = mode === "layout" ? LAYOUT_OVERLAY_COLORS : OVERLAY_COLORS;
    const elementRef = React.useRef<HTMLElement>(null);
    const { window: iframeWindow } = useFrame();

    // Check if we're inside a Repeater
    const repeaterContext = React.use(RepeaterItemContext);

    // Generate unique field ID for overlay tracking
    const fieldId = getOverlayFieldId(blockId, repeaterContext, String(name));

    // Get field value based on context
    const fieldValue = (repeaterContext ? repeaterContext.itemContent[name] : content[name]) as
      | string
      | Record<string, unknown>;

    // Local hover/focus state for overlay styling
    const [isHovered, setIsHovered] = React.useState(false);
    const [isEditorFocused, setIsEditorFocused] = React.useState(false);

    // Derive selected state from selection
    const isSelectedFromBreadcrumbs = useFieldSelection(
      blockId,
      String(name),
      "String",
      repeaterContext?.itemId,
    );

    const isFocused = isEditorFocused || isSelectedFromBreadcrumbs;

    // Keep sidebar hover via postMessage (transient state)
    const isHoveredFromSidebar = useOverlayMessage(
      iframeWindow,
      isContentEditable,
      "CAMOX_HOVER_FIELD",
      "CAMOX_HOVER_FIELD_END",
      { fieldId },
    );

    React.useEffect(() => {
      setIsHovered(isHoveredFromSidebar);
    }, [isHoveredFromSidebar]);

    const updateBlockContent = useMutation(blockMutations.updateContent());
    const updateRepeatableContent = useMutation(repeatableItemMutations.updateContent());

    const handleChange = React.useCallback(
      (newValue: string) => {
        if (repeaterContext) {
          const { itemId } = repeaterContext;
          if (itemId) {
            updateRepeatableContent.mutate({
              id: Number(itemId),
              content: { [name]: newValue },
            });
          }
        } else {
          updateBlockContent.mutate({
            id: Number(blockId),
            content: { [name]: newValue },
          });
        }
      },
      [blockId, name, repeaterContext, updateBlockContent, updateRepeatableContent],
    );

    const handleFocus = React.useCallback(() => {
      setIsEditorFocused(true);
      if (repeaterContext?.itemId) {
        previewStore.send({
          type: "selectItemField",
          blockId,
          itemId: repeaterContext.itemId,
          fieldName: name.toString(),
          fieldType: "String",
        });
      } else {
        previewStore.send({
          type: "selectBlockField",
          blockId,
          fieldName: name.toString(),
          fieldType: "String",
        });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blockId, name, repeaterContext?.itemId]);

    const handleBlur = React.useCallback(() => {
      setIsEditorFocused(false);
    }, []);

    const handleMouseEnter = () => {
      if (isContentEditable) {
        setIsHovered(true);
      }
    };

    const handleMouseLeave = () => {
      if (isContentEditable) {
        setIsHovered(false);
      }
    };

    const overlayStyle =
      isContentEditable && (isHovered || isFocused)
        ? {
            outline: `${isFocused ? OVERLAY_WIDTHS.selected : OVERLAY_WIDTHS.hover} solid ${isFocused ? colors.selected : colors.hover}`,
            outlineOffset: isFocused ? OVERLAY_OFFSETS.fieldSelected : OVERLAY_OFFSETS.fieldHover,
          }
        : undefined;

    if (!isContentEditable) {
      const reactContent = markdownToReactNodes(fieldValue);
      return <>{children(reactContent)}</>;
    }

    return (
      <Slot
        ref={elementRef}
        data-camox-field-id={fieldId}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={overlayStyle}
      >
        {children(
          <InlineLexicalEditor
            initialState={fieldValue}
            externalState={fieldValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />,
        )}
      </Slot>
    );
  };

  const Embed = <K extends keyof EmbedFields>({
    name,
    children,
  }: {
    name: K;
    children: (url: string) => React.ReactNode;
  }) => {
    const blockContext = React.use(Context);
    if (!blockContext) {
      throw new Error("Embed must be used within a Block Component");
    }

    const { blockId, content, mode } = blockContext;
    const isContentEditable = useIsEditable(mode);
    const colors = mode === "layout" ? LAYOUT_OVERLAY_COLORS : OVERLAY_COLORS;
    const { window: iframeWindow } = useFrame();
    const repeaterContext = React.use(RepeaterItemContext);
    const fieldValue = repeaterContext
      ? (repeaterContext.itemContent[name] as string)
      : (content[name] as string);

    const fieldId = getOverlayFieldId(blockId, repeaterContext, String(name));

    const [isOpen, setIsOpen] = React.useState(false);
    const [urlValue, setUrlValue] = React.useState(fieldValue);
    const [isHovered, setIsHovered] = React.useState(false);
    const timerRef = React.useRef<number | null>(null);

    const isHoveredFromSidebar = useOverlayMessage(
      iframeWindow,
      isContentEditable,
      "CAMOX_HOVER_FIELD",
      "CAMOX_HOVER_FIELD_END",
      { fieldId },
    );

    React.useEffect(() => {
      setIsHovered(isHoveredFromSidebar);
    }, [isHoveredFromSidebar]);

    const updateBlockContent = useMutation(blockMutations.updateContent());
    const updateRepeatableContent = useMutation(repeatableItemMutations.updateContent());

    // Sync urlValue with fieldValue when popover is closed
    React.useEffect(() => {
      if (!isOpen) {
        setUrlValue(fieldValue);
      }
    }, [fieldValue, isOpen]);

    // Cleanup timer on unmount
    React.useEffect(() => {
      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
      };
    }, []);

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setUrlValue(newValue);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        if (repeaterContext?.itemId) {
          updateRepeatableContent.mutate({
            id: Number(repeaterContext.itemId),
            content: { [name]: newValue },
          });
        } else {
          updateBlockContent.mutate({
            id: Number(blockId),
            content: { [name]: newValue },
          });
        }
      }, 500);
    };

    const handleOpenChange = (open: boolean) => {
      setIsOpen(open);
      if (open) {
        if (repeaterContext?.itemId) {
          previewStore.send({
            type: "selectItemField",
            blockId,
            itemId: repeaterContext.itemId,
            fieldName: name.toString(),
            fieldType: "Embed",
          });
        } else {
          previewStore.send({
            type: "selectBlockField",
            blockId,
            fieldName: name.toString(),
            fieldType: "Embed",
          });
        }
      }
    };

    return (
      <Popover
        open={isContentEditable ? isOpen : false}
        onOpenChange={isContentEditable ? handleOpenChange : undefined}
      >
        <PopoverTrigger asChild>
          <div
            style={{ position: "relative" }}
            onMouseEnter={isContentEditable ? () => setIsHovered(true) : undefined}
            onMouseLeave={isContentEditable ? () => setIsHovered(false) : undefined}
          >
            {children(fieldValue)}
            {isContentEditable && (
              <>
                {/* Transparent full-coverage overlay to intercept iframe pointer events */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 10,
                  }}
                  onClick={() => {
                    if (hasShownEmbedLockToast) return;
                    hasShownEmbedLockToast = true;
                    toast(
                      <span>
                        Hold <Kbd>L</Kbd> to interact with the embed content
                      </span>,
                    );
                  }}
                />
                {(isHovered || isOpen) && (
                  <div
                    style={{
                      position: "absolute",
                      inset: isOpen ? OVERLAY_OFFSETS.blockSelected : OVERLAY_OFFSETS.blockHover,
                      border: `${isOpen ? OVERLAY_WIDTHS.selected : OVERLAY_WIDTHS.hover} solid ${isOpen ? colors.selected : colors.hover}`,
                      pointerEvents: "none",
                      zIndex: 11,
                    }}
                  />
                )}
              </>
            )}
          </div>
        </PopoverTrigger>
        {isContentEditable && (
          <PopoverContent className="w-96 gap-2">
            <form className="grid gap-2">
              <Label htmlFor="url">
                {(options.content[name] as { title?: string })?.title ?? String(name)}
              </Label>
              <Input type="url" id="url" value={urlValue} onChange={handleUrlChange} />
            </form>
          </PopoverContent>
        )}
      </Popover>
    );
  };

  const Link = <K extends keyof LinkFields>({
    name,
    children,
  }: {
    name: K;
    children: (link: { text: string; href: string; newTab: boolean }) => React.ReactNode;
  }) => {
    const blockContext = React.use(Context);
    if (!blockContext) {
      throw new Error("Link must be used within a Block Component");
    }

    const { blockId, content, mode } = blockContext;
    const isContentEditable = useIsEditable(mode);
    const colors = mode === "layout" ? LAYOUT_OVERLAY_COLORS : OVERLAY_COLORS;
    const elementRef = React.useRef<HTMLElement>(null);
    const { window: iframeWindow } = useFrame();
    const repeaterContext = React.use(RepeaterItemContext);
    const rawFieldValue = repeaterContext
      ? (repeaterContext.itemContent[name] as LinkValue)
      : (content[name] as LinkValue);
    const fieldValue = normalizeLinkValue(rawFieldValue as unknown as Record<string, unknown>);
    const updateBlockContent = useMutation(blockMutations.updateContent());
    const updateRepeatableContent = useMutation(repeatableItemMutations.updateContent());
    const { data: pages } = useQuery(pageQueries.list());
    const resolvedHref = resolveLinkHref(fieldValue, pages as Page[] | undefined);

    const fieldId = getOverlayFieldId(blockId, repeaterContext, String(name));

    const [isEditing, setIsEditing] = React.useState(false);
    const [displayText, setDisplayText] = React.useState(fieldValue.text);
    const [isHovered, setIsHovered] = React.useState(false);
    const [isEditorFocused, setIsEditorFocused] = React.useState(false);

    // Derive selected state from selection
    const isSelectedFromBreadcrumbs = useFieldSelection(
      blockId,
      String(name),
      "Link",
      repeaterContext?.itemId,
    );

    const isFocused = isEditorFocused || isSelectedFromBreadcrumbs;

    React.useEffect(() => {
      if (!isEditing) {
        setDisplayText(fieldValue.text);
      }
    }, [fieldValue.text, isEditing]);

    // Keep sidebar hover via postMessage (transient state)
    const isHoveredFromSidebar = useOverlayMessage(
      iframeWindow,
      isContentEditable,
      "CAMOX_HOVER_FIELD",
      "CAMOX_HOVER_FIELD_END",
      { fieldId },
    );

    React.useEffect(() => {
      setIsHovered(isHoveredFromSidebar);
    }, [isHoveredFromSidebar]);

    const saveLinkValue = (newLinkValue: Record<string, unknown>) => {
      if (repeaterContext?.itemId) {
        updateRepeatableContent.mutate({
          id: Number(repeaterContext.itemId),
          content: { [name]: newLinkValue },
        });
      } else {
        updateBlockContent.mutate({
          id: Number(blockId),
          content: { [name]: newLinkValue },
        });
      }
    };

    const handleInput = (e: React.FormEvent<HTMLElement>) => {
      const newText = (e.target as HTMLElement).textContent || "";
      saveLinkValue({ ...fieldValue, text: newText });
    };

    const handleFocus = () => {
      setIsEditing(true);
      setIsEditorFocused(true);
      if (repeaterContext?.itemId) {
        previewStore.send({
          type: "selectItemField",
          blockId,
          itemId: repeaterContext.itemId,
          fieldName: String(name),
          fieldType: "Link",
        });
      } else {
        previewStore.send({
          type: "selectBlockField",
          blockId,
          fieldName: String(name),
          fieldType: "Link",
        });
      }
    };

    const handleBlur = () => {
      setIsEditing(false);
      setIsEditorFocused(false);
    };

    const handleEditLink = (e: React.MouseEvent) => {
      e.stopPropagation();
      previewStore.send({ type: "toggleContentSheet" });
      setIsEditorFocused(false);
      setIsEditing(false);
    };

    return (
      <Popover open={isContentEditable && isEditorFocused}>
        <PopoverAnchor asChild>
          <Slot
            ref={elementRef}
            data-camox-field-id={isContentEditable ? fieldId : undefined}
            contentEditable={isContentEditable}
            onClick={isContentEditable ? (e: React.MouseEvent) => e.preventDefault() : undefined}
            onInput={handleInput}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onMouseEnter={isContentEditable ? () => setIsHovered(true) : undefined}
            onMouseLeave={isContentEditable ? () => setIsHovered(false) : undefined}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Escape") {
                (e.target as HTMLElement).blur();
              }
            }}
            spellCheck={false}
            suppressContentEditableWarning={true}
            style={
              isContentEditable && (isHovered || isFocused)
                ? {
                    outline: `${isFocused ? OVERLAY_WIDTHS.selected : OVERLAY_WIDTHS.hover} solid ${isFocused ? colors.selected : colors.hover}`,
                    outlineOffset: isFocused
                      ? OVERLAY_OFFSETS.fieldSelected
                      : OVERLAY_OFFSETS.fieldHover,
                  }
                : undefined
            }
          >
            {children({
              text: displayText,
              href: resolvedHref,
              newTab: fieldValue.newTab,
            })}
          </Slot>
        </PopoverAnchor>
        {isContentEditable && (
          <PopoverContent
            className="w-auto p-2"
            onOpenAutoFocus={(e) => e.preventDefault()}
            align="end"
          >
            <button
              type="button"
              className="hover:bg-accent flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleEditLink}
            >
              Edit link
            </button>
          </PopoverContent>
        )}
      </Popover>
    );
  };

  const Image = <K extends keyof ImageFields>({
    name,
    children,
  }: {
    name: K;
    children: (image: ImageValue) => React.ReactNode;
  }) => {
    const blockContext = React.use(Context);
    if (!blockContext) {
      throw new Error("Image must be used within a Block Component");
    }

    const { blockId, content, mode } = blockContext;
    const isContentEditable = useIsEditable(mode);
    const colors = mode === "layout" ? LAYOUT_OVERLAY_COLORS : OVERLAY_COLORS;
    const { window: iframeWindow } = useFrame();
    const repeaterContext = React.use(RepeaterItemContext);
    const { filesMap } = useNormalizedData();
    const rawSource = repeaterContext ? repeaterContext.itemContent[name] : content[name];
    // Resolve _fileId markers to full file objects
    const rawValue = isFileMarker(rawSource)
      ? (resolveFileMarker(rawSource, filesMap) as unknown as ImageValue)
      : (rawSource as ImageValue | null);
    const fieldValue = rawValue ?? (contentDefaults[String(name)] as ImageValue);

    const fieldId = getOverlayFieldId(blockId, repeaterContext, String(name));

    const [isHovered, setIsHovered] = React.useState(false);

    // Derive selected state from selection
    const isFocused = useFieldSelection(blockId, String(name), "Image", repeaterContext?.itemId);

    // Keep sidebar hover via postMessage (transient state)
    const isHoveredFromSidebar = useOverlayMessage(
      iframeWindow,
      isContentEditable,
      "CAMOX_HOVER_FIELD",
      "CAMOX_HOVER_FIELD_END",
      { fieldId },
    );

    React.useEffect(() => {
      setIsHovered(isHoveredFromSidebar);
    }, [isHoveredFromSidebar]);

    const handleClick = () => {
      if (!isContentEditable) return;
      // For inline array items (no itemId, e.g. multi-asset gallery),
      // use the array field name so the sidebar shows the gallery editor
      const imageFieldName =
        repeaterContext && !repeaterContext.itemId ? repeaterContext.arrayFieldName : String(name);

      if (repeaterContext?.itemId) {
        previewStore.send({
          type: "selectItemField",
          blockId,
          itemId: repeaterContext.itemId,
          fieldName: imageFieldName,
          fieldType: "Image",
        });
      } else {
        previewStore.send({
          type: "selectBlockField",
          blockId,
          fieldName: imageFieldName,
          fieldType: "Image",
        });
      }
      previewStore.send({ type: "toggleContentSheet" });
    };

    if (!isContentEditable) {
      return <>{children(fieldValue)}</>;
    }

    const showOverlay = isHovered || isFocused;

    return (
      <div
        style={{ position: "relative" }}
        data-camox-field-id={fieldId}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleClick}
      >
        {children(fieldValue)}
        {showOverlay && (
          <div
            style={{
              position: "absolute",
              inset: isFocused ? OVERLAY_OFFSETS.blockSelected : OVERLAY_OFFSETS.blockHover,
              border: `${isFocused ? OVERLAY_WIDTHS.selected : OVERLAY_WIDTHS.hover} solid ${isFocused ? colors.selected : colors.hover}`,
              pointerEvents: "none",
              zIndex: 10,
            }}
          />
        )}
      </div>
    );
  };

  const File = <K extends keyof FileFields>({
    name,
    children,
  }: {
    name: K;
    children: (file: FileValue) => React.ReactNode;
  }) => {
    const blockContext = React.use(Context);
    if (!blockContext) {
      throw new Error("File must be used within a Block Component");
    }

    const { content } = blockContext;
    const repeaterContext = React.use(RepeaterItemContext);
    const { filesMap } = useNormalizedData();
    const rawSource = repeaterContext ? repeaterContext.itemContent[name] : content[name];
    // Resolve _fileId markers to full file objects
    const rawValue = isFileMarker(rawSource)
      ? (resolveFileMarker(rawSource, filesMap) as unknown as FileValue)
      : (rawSource as FileValue | null);
    const fieldValue = rawValue ?? (contentDefaults[String(name)] as FileValue);

    return <>{children(fieldValue)}</>;
  };

  // RepeaterItemWrapper - wraps each repeater item with overlay support
  const RepeaterItemWrapper = ({
    itemId,
    blockId,
    mode,
    children,
  }: {
    itemId: string | undefined;
    blockId: string;
    mode: "site" | "peek" | "layout";
    children: React.ReactNode;
  }) => {
    const isContentEditable = useIsEditable(mode);
    const colors = mode === "layout" ? LAYOUT_OVERLAY_COLORS : OVERLAY_COLORS;
    const { window: iframeWindow } = useFrame();

    // Check if the parent repeater container is being hovered from sidebar
    const isRepeaterHovered = React.useContext(RepeaterHoverContext);

    const isHovered = useOverlayMessage(
      iframeWindow,
      isContentEditable,
      "CAMOX_HOVER_REPEATER_ITEM",
      "CAMOX_HOVER_REPEATER_ITEM_END",
      { blockId, itemId },
    );

    const showOverlay = isContentEditable && (isHovered || isRepeaterHovered);

    return (
      <div
        style={{ position: "relative" }}
        data-camox-repeater-item-id={isContentEditable ? itemId : undefined}
      >
        {children}
        {showOverlay && (
          <div
            style={{
              position: "absolute",
              inset: OVERLAY_OFFSETS.blockHover,
              border: `${OVERLAY_WIDTHS.hover} solid ${colors.hover}`,
              pointerEvents: "none",
              zIndex: 10,
            }}
          />
        )}
      </div>
    );
  };

  // RepeaterHoverProvider - provides hover state to child items without adding DOM elements
  const RepeaterHoverProvider = ({
    blockId,
    fieldName,
    children,
  }: {
    blockId: string;
    fieldName: string;
    children: React.ReactNode;
  }) => {
    const isContentEditable = useIsEditable("site");
    const { window: iframeWindow } = useFrame();

    const isHovered = useOverlayMessage(
      iframeWindow,
      isContentEditable,
      "CAMOX_HOVER_REPEATER",
      "CAMOX_HOVER_REPEATER_END",
      { blockId, fieldName },
    );

    return (
      <RepeaterHoverContext.Provider value={isHovered}>{children}</RepeaterHoverContext.Provider>
    );
  };

  const Repeater = <K extends keyof RepeatableFields>({
    name,
    children,
  }: {
    name: K;
    children: (
      item: {
        Field: <F extends keyof ItemStringFields<K>>(props: {
          name: F;
          children: (content: React.ReactNode) => React.ReactNode;
        }) => React.ReactNode;
        Link: <F extends keyof ItemLinkFields<K>>(props: {
          name: F;
          children: (link: { text: string; href: string; newTab: boolean }) => React.ReactNode;
        }) => React.ReactNode;
        Embed: <F extends keyof ItemEmbedFields<K>>(props: {
          name: F;
          children: (url: string) => React.ReactNode;
        }) => React.ReactNode;
        Image: <F extends keyof ItemImageFields<K>>(props: {
          name: F;
          children: (image: ImageValue) => React.ReactNode;
        }) => React.ReactNode;
        File: <F extends keyof ItemFileFields<K>>(props: {
          name: F;
          children: (file: FileValue) => React.ReactNode;
        }) => React.ReactNode;
        Repeater: <F extends keyof ItemRepeatableFields<K>>(props: {
          name: F;
          children: (
            item: {
              Field: (props: {
                name: string;
                children: (content: any) => React.ReactNode;
              }) => React.ReactNode;
              Link: (props: {
                name: string;
                children: (link: {
                  text: string;
                  href: string;
                  newTab: boolean;
                }) => React.ReactNode;
              }) => React.ReactNode;
              Embed: (props: {
                name: string;
                children: (url: string) => React.ReactNode;
              }) => React.ReactNode;
              Image: (props: {
                name: string;
                children: (image: ImageValue) => React.ReactNode;
              }) => React.ReactNode;
              File: (props: {
                name: string;
                children: (file: FileValue) => React.ReactNode;
              }) => React.ReactNode;
              Repeater: (props: {
                name: string;
                children: (item: any, index: number) => React.ReactNode;
              }) => React.ReactNode;
            },
            index: number,
          ) => React.ReactNode;
        }) => React.ReactNode;
      },
      index: number,
    ) => React.ReactNode;
  }) => {
    const blockContext = React.use(Context);
    if (!blockContext) {
      throw new Error("Repeater must be used within a Block Component");
    }

    const { blockId, content, mode } = blockContext;

    // Check if we're inside another repeater (nested)
    const parentRepeaterContext = React.use(RepeaterItemContext);
    const fieldName = String(name);

    // Type-cast components to work with item fields
    // This is safe because each component checks RepeaterItemContext at runtime
    const ItemField = Field as <F extends keyof ItemStringFields<K>>(props: {
      name: F;
      children: (content: React.ReactNode) => React.ReactNode;
    }) => React.ReactNode;

    const ItemLink = Link as <F extends keyof ItemLinkFields<K>>(props: {
      name: F;
      children: (link: { text: string; href: string; newTab: boolean }) => React.ReactNode;
    }) => React.ReactNode;

    const ItemEmbed = Embed as <F extends keyof ItemEmbedFields<K>>(props: {
      name: F;
      children: (url: string) => React.ReactNode;
    }) => React.ReactNode;

    const ItemImage = Image as <F extends keyof ItemImageFields<K>>(props: {
      name: F;
      children: (image: ImageValue) => React.ReactNode;
    }) => React.ReactNode;

    const ItemFile = File as <F extends keyof ItemFileFields<K>>(props: {
      name: F;
      children: (file: FileValue) => React.ReactNode;
    }) => React.ReactNode;

    const ItemRepeater = Repeater as <F extends keyof ItemRepeatableFields<K>>(props: {
      name: F;
      children: (
        item: {
          Field: (props: {
            name: string;
            children: (content: any) => React.ReactNode;
          }) => React.ReactNode;
          Link: (props: {
            name: string;
            children: (link: { text: string; href: string; newTab: boolean }) => React.ReactNode;
          }) => React.ReactNode;
          Embed: (props: {
            name: string;
            children: (url: string) => React.ReactNode;
          }) => React.ReactNode;
          Image: (props: {
            name: string;
            children: (image: ImageValue) => React.ReactNode;
          }) => React.ReactNode;
          File: (props: {
            name: string;
            children: (file: FileValue) => React.ReactNode;
          }) => React.ReactNode;
          Repeater: (props: {
            name: string;
            children: (item: any, index: number) => React.ReactNode;
          }) => React.ReactNode;
        },
        index: number,
      ) => React.ReactNode;
    }) => React.ReactNode;

    const itemComponents = {
      Field: ItemField,
      Link: ItemLink,
      Embed: ItemEmbed,
      Image: ItemImage,
      File: ItemFile,
      Repeater: ItemRepeater,
    };

    // Items come from either the parent repeater context (nested) or block content (top-level)
    const source = parentRepeaterContext ? parentRepeaterContext.itemContent[name] : content[name];
    const { itemsMap } = useNormalizedData();
    let arrayValue = (source ?? []) as any[];

    if (!Array.isArray(arrayValue)) {
      throw new Error(`Field "${String(name)}" is not an array`);
    }

    // Resolve _itemId markers to full item objects from the normalized data
    arrayValue = arrayValue
      .map((item: any) => {
        if (isItemMarker(item)) {
          return itemsMap.get(item._itemId) ?? null;
        }
        return item;
      })
      .filter(Boolean);

    type TItem = RepeatableItemType<K>;

    return (
      <RepeaterHoverProvider blockId={blockId} fieldName={fieldName}>
        {arrayValue.map((item: any, index: number) => {
          // DB-backed items have { id, content, ... }; inline items are plain objects
          const isDbItem = item.content !== undefined && item.id != null;
          const itemContent = {
            ...repeatableItemDefaults[fieldName],
            ...(isDbItem ? item.content : item),
          } as TItem;
          const itemId = isDbItem ? String(item.id) : undefined;

          return (
            <RepeaterItemContext.Provider
              key={itemId || index}
              value={{
                arrayFieldName: fieldName,
                itemIndex: index,
                itemContent: itemContent,
                itemId: itemId,
              }}
            >
              <RepeaterItemWrapper itemId={itemId} blockId={blockId} mode={mode}>
                {children(itemComponents, index)}
              </RepeaterItemWrapper>
            </RepeaterItemContext.Provider>
          );
        })}
      </RepeaterHoverProvider>
    );
  };

  const BlockComponent = ({
    blockData,
    mode,
    isFirstBlock,
    showAddBlockTop,
    showAddBlockBottom,
    addBlockAfterPosition,
  }: BlockComponentProps<TContent>) => {
    const isContentEditable = useIsEditable(mode);
    const { window: iframeWindow } = useFrame();

    // Local state for hover
    const [isHovered, setIsHovered] = React.useState(false);

    // Scroll into view when editing in preview
    const selection = useSelector(previewStore, (state) => state.context.selection);
    const isPageContentSheetOpen = useSelector(
      previewStore,
      (state) => state.context.isPageContentSheetOpen,
    );
    const isAddBlockSheetOpen = useSelector(
      previewStore,
      (state) => state.context.isAddBlockSheetOpen,
    );
    const isAnySideSheetOpen = useIsPreviewSheetOpen();
    const isBlockSelected = selection?.blockId === blockData._id;
    const ref = React.useRef<HTMLDivElement>(null);

    // Track first render because we won't animate the scroll into view for it
    const [isFirstRender, setIsFirstRender] = React.useState(true);
    React.useEffect(() => {
      if (isFirstRender) {
        setIsFirstRender(false);
      }
    }, [isFirstRender]);

    // Scroll block into view when selected or when content sheet opens
    React.useEffect(() => {
      if (isBlockSelected && ref.current) {
        ref.current.scrollIntoView({
          behavior: isFirstRender ? "instant" : "smooth",
          block: isFirstRender ? "start" : "nearest",
        });
      }
    }, [isBlockSelected, isFirstRender, isPageContentSheetOpen]);

    // Listen for sidebar-triggered hover messages
    const isHoveredFromSidebar = useOverlayMessage(
      iframeWindow,
      isContentEditable,
      "CAMOX_HOVER_BLOCK",
      "CAMOX_HOVER_BLOCK_END",
      { blockId: blockData._id },
    );

    React.useEffect(() => {
      setIsHovered(isHoveredFromSidebar);
    }, [isHoveredFromSidebar]);

    // Normalize content: keep full item objects for internal use, but prepare content-only version for display
    // We need to keep blockData.content as-is because Repeater needs the full objects with _id
    // But we also need to pass to options.component for the content prop (used in non-Repeater contexts)
    const normalizedContent = React.useMemo(() => {
      const result = { ...blockData.content } as any;

      // Transform array fields from full item objects to content-only for the component prop
      for (const key in result) {
        const value = result[key];
        if (Array.isArray(value) && value.length > 0 && value[0]?.content !== undefined) {
          // Extract just the content for the component prop
          result[key] = value.map((item: any) => item.content);
        }
      }

      return result as TContent;
    }, [blockData.content]);

    const handleClick = (e: React.MouseEvent) => {
      if (!isContentEditable) return;

      // Don't select block if clicking on a field
      const target = e.target as HTMLElement;
      if (target.closest("[data-camox-field-id]")) return;

      previewStore.send({ type: "setFocusedBlock", blockId: blockData._id });
    };

    const handleMouseEnter = () => {
      if (isContentEditable) {
        setIsHovered(true);
      }
    };

    const handleMouseLeave = () => {
      if (isContentEditable) {
        setIsHovered(false);
      }
    };

    const handleAddBlockClick = (insertPosition: "before" | "after") => {
      postOverlayMessage({
        type: "CAMOX_ADD_BLOCK_REQUEST",
        blockPosition: blockData.position,
        insertPosition,
        ...(addBlockAfterPosition !== undefined && {
          afterPosition: addBlockAfterPosition,
        }),
      });
    };

    // The bright colors overlays to show selection and editable content
    const shouldShowOverlay =
      isContentEditable && (isHovered || isBlockSelected) && !isAddBlockSheetOpen;

    // The overlay to darken everything but one block when a preview sheet is open
    const shouldShowSheetOverlay =
      // When adding a block elsewhere
      (isAddBlockSheetOpen && mode !== "peek") ||
      // Another block is being edited in the sheet
      (isPageContentSheetOpen && !isBlockSelected);

    return (
      <div
        className="group visual-editing-block"
        ref={ref}
        style={{
          position: "relative",
          scrollMargin: "5rem",
          background: "var(--background)",
        }}
        data-camox-block-id={isContentEditable ? blockData._id : undefined}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Context.Provider
          value={{
            blockId: blockData._id,
            content: (() => {
              const merged = { ...contentDefaults, ...blockData.content };
              const overrides: Record<string, unknown> = {};
              for (const key in merged) {
                const val = (merged as Record<string, unknown>)[key];
                if (
                  val &&
                  typeof val === "object" &&
                  "url" in val &&
                  !(val as any).url &&
                  contentDefaults[key]
                ) {
                  overrides[key] = contentDefaults[key];
                }
              }
              return { ...merged, ...overrides };
            })(),
            settings: {
              ...settingsDefaults,
              ...blockData.settings,
            } as TSettings,
            mode,
            isHovered,
            setIsHovered,
          }}
        >
          <options.component content={normalizedContent} />
        </Context.Provider>
        {/* Sheet overlay */}
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            top: 0,
            left: 0,
            background: "#000",
            opacity: shouldShowSheetOverlay ? 0.6 : 0,
            transition: "opacity 0.3s ease-in-out",
            pointerEvents: "none",
            zIndex: 20,
          }}
          id="hello"
        />
        {/* Overlay UI */}
        {shouldShowOverlay &&
          (() => {
            const colors = mode === "layout" ? LAYOUT_OVERLAY_COLORS : OVERLAY_COLORS;
            return (
              <>
                {/* Border overlay */}
                <div
                  style={{
                    position: "absolute",
                    inset: isBlockSelected
                      ? OVERLAY_OFFSETS.blockSelected
                      : OVERLAY_OFFSETS.blockHover,
                    border: `${isBlockSelected ? OVERLAY_WIDTHS.selected : OVERLAY_WIDTHS.hover} solid ${isBlockSelected ? colors.selected : colors.hover}`,
                    pointerEvents: "none",
                    zIndex: 10,
                  }}
                />

                {(() => {
                  // Use explicit show flags if provided, otherwise fall back to legacy behavior
                  const displayTop = showAddBlockTop ?? (mode !== "layout" && !isFirstBlock);
                  const displayBottom = showAddBlockBottom ?? mode !== "layout";
                  return (
                    <>
                      {displayTop && (
                        <AddBlockControlBar
                          position="top"
                          hidden={isAnySideSheetOpen}
                          onMouseLeave={() => setIsHovered(false)}
                          onClick={() => handleAddBlockClick("before")}
                        />
                      )}
                      {displayBottom && (
                        <AddBlockControlBar
                          position="bottom"
                          hidden={isAnySideSheetOpen}
                          onMouseLeave={() => setIsHovered(false)}
                          onClick={() => handleAddBlockClick("after")}
                        />
                      )}
                    </>
                  );
                })()}
              </>
            );
          })()}
      </div>
    );
  };

  const useSetting = <K extends keyof TSettings>(name: K): TSettings[K] => {
    const ctx = React.use(Context);
    if (!ctx) {
      throw new Error("useSetting must be used within a Block Component");
    }
    return ctx.settings[name];
  };

  /**
   * Wraps block content that renders outside the block's visual bounds (fixed navbars, modals, portals, etc.).
   * Provides the same hover, selection, and sheet overlays as the main BlockComponent.
   */
  const Detached = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
    const ctx = React.use(Context);
    if (!ctx) {
      throw new Error("Detached must be used within a Block Component");
    }
    const { blockId, mode, isHovered, setIsHovered } = ctx;

    const isContentEditable = useIsEditable(mode);
    const { window: iframeWindow } = useFrame();

    const selection = useSelector(previewStore, (state) => state.context.selection);
    const isAddBlockSheetOpen = useSelector(
      previewStore,
      (state) => state.context.isAddBlockSheetOpen,
    );
    const isPageContentSheetOpen = useSelector(
      previewStore,
      (state) => state.context.isPageContentSheetOpen,
    );
    const isBlockSelected = selection?.blockId === blockId;

    const isHoveredFromSidebar = useOverlayMessage(
      iframeWindow,
      isContentEditable,
      "CAMOX_HOVER_BLOCK",
      "CAMOX_HOVER_BLOCK_END",
      { blockId },
    );

    React.useEffect(() => {
      setIsHovered(isHoveredFromSidebar);
    }, [isHoveredFromSidebar, setIsHovered]);

    const shouldShowOverlay =
      isContentEditable && (isHovered || isBlockSelected) && !isAddBlockSheetOpen;

    const shouldShowSheetOverlay =
      (isAddBlockSheetOpen && mode !== "peek") || (isPageContentSheetOpen && !isBlockSelected);

    const handleClick = (e: React.MouseEvent) => {
      if (!isContentEditable) return;
      e.stopPropagation();
      previewStore.send({ type: "setFocusedBlock", blockId });
    };

    const handleMouseEnter = () => {
      if (isContentEditable) {
        setIsHovered(true);
      }
    };

    const handleMouseLeave = () => {
      if (isContentEditable) {
        setIsHovered(false);
      }
    };

    const [container, setContainer] = React.useState<HTMLElement | null>(null);

    return (
      <>
        <Slot
          ref={setContainer}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {children}
        </Slot>
        {container &&
          createPortal(
            <>
              {/* Sheet overlay */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "#000",
                  opacity: shouldShowSheetOverlay ? 0.6 : 0,
                  transition: "opacity 0.3s ease-in-out",
                  pointerEvents: "none",
                  zIndex: 20,
                }}
              />
              {/* Border overlay */}
              {shouldShowOverlay &&
                (() => {
                  const colors = mode === "layout" ? LAYOUT_OVERLAY_COLORS : OVERLAY_COLORS;
                  return (
                    <div
                      style={{
                        position: "absolute",
                        inset: isBlockSelected
                          ? OVERLAY_OFFSETS.blockSelected
                          : OVERLAY_OFFSETS.blockHover,
                        border: `${isBlockSelected ? OVERLAY_WIDTHS.selected : OVERLAY_WIDTHS.hover} solid ${isBlockSelected ? colors.selected : colors.hover}`,
                        pointerEvents: "none",
                        zIndex: 10,
                      }}
                    />
                  );
                })()}
            </>,
            container,
          )}
      </>
    );
  };

  return {
    /**
     * The react component to be used at the page level when mapping on blocks content.
     * It exposes context that will be consumed by the Field component, and provides visual editing
     * capabilities (e.g. delete and reorder blocks).
     */
    Component: BlockComponent,
    Detached,
    Field,
    Embed,
    Link,
    Image,
    File,
    Repeater,
    useSetting,
    id: options.id,
    title: options.title,
    description: options.description,
    contentSchema,
    settingsSchema,
    getInitialBundle: () => {
      const counter = { value: 0 };
      const allSeeds: RepeatableItemSeed[] = [];

      // Build content with _itemId markers for repeatable fields, scalar defaults for the rest
      const content: Record<string, unknown> = { ...contentDefaults };
      buildInitialSeeds(typeboxSchema.properties, null, content, allSeeds, counter);

      // Strip repeatable markers and asset placeholders for storage-safe content
      const storageContent: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(typeboxSchema.properties)) {
        const ft = (prop as any).fieldType;
        const ait = (prop as any).arrayItemType;
        if (
          ft === "Image" ||
          ft === "File" ||
          ft === "RepeatableItem" ||
          ait === "Image" ||
          ait === "File"
        ) {
          continue;
        }
        if ("default" in prop) {
          storageContent[key] = prop.default;
        }
      }

      return {
        content: storageContent as Record<string, unknown>,
        settings: { ...settingsDefaults },
        repeatableItems: allSeeds,
      };
    },
    getInitialContent: () => {
      return { ...contentDefaultsForStorage } as TContent;
    },
    getInitialSettings: () => {
      return { ...settingsDefaults };
    },
    getPeekBundle: () => {
      const PEEK_BLOCK_ID = -1;
      const counter = { value: 0 };
      const allItems: PeekItem[] = [];

      // Build content with _itemId markers for repeatable fields, scalar defaults for the rest
      const content: Record<string, unknown> = { ...contentDefaults };
      buildPeekItems(typeboxSchema.properties, PEEK_BLOCK_ID, null, content, allItems, counter);

      return {
        block: {
          id: PEEK_BLOCK_ID,
          pageId: null,
          layoutId: null,
          type: options.id,
          content,
          settings: settingsDefaults,
          placement: null,
          summary: "",
          position: "",
          createdAt: 0,
          updatedAt: 0,
        },
        repeatableItems: allItems,
        files: [],
      };
    },
    layoutOnly: options.layoutOnly ?? false,
  };
}

export type Block = ReturnType<typeof createBlock>;
