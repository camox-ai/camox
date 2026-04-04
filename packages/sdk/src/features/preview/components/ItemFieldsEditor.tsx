import { Input } from "@camox/ui/input";
import { Label } from "@camox/ui/label";
import { useForm } from "@tanstack/react-form";
import { Link2 as Link2Icon, Images as ImagesIcon, ImageIcon, FileIcon } from "lucide-react";
import * as React from "react";

import { SidebarLexicalEditor } from "@/core/components/lexical/SidebarLexicalEditor";
import type { FieldType } from "@/core/lib/fieldTypes";
import {
  isFileMarker,
  isItemMarker,
  resolveFileMarker,
  type NormalizedFile,
  type NormalizedItem,
} from "@/lib/normalized-data";

import type { OverlayMessage } from "../overlayMessages";
import { previewStore } from "../previewStore";
import { RepeatableItemsList } from "./RepeatableItemsList";

/* -------------------------------------------------------------------------------------------------
 * SchemaField type + helpers (shared)
 * -----------------------------------------------------------------------------------------------*/

export interface SchemaField {
  name: string;
  fieldType: "String" | "RepeatableItem" | "Enum" | "Boolean" | "Embed" | "Link" | "Image" | "File";
  label?: string;
  enumLabels?: Record<string, string>;
  enumValues?: string[];
  minItems?: number;
  maxItems?: number;
  arrayItemType?: "Image" | "File";
}

export const formatFieldName = (fieldName: string): string => {
  // Convert camelCase to Title Case with spaces
  return fieldName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

const getSchemaFieldsInOrder = (schema: unknown): SchemaField[] => {
  const properties = (schema as any)?.properties;
  if (!properties) return [];

  return Object.keys(properties).map((fieldName) => {
    const prop = properties[fieldName] as any;
    return {
      name: fieldName,
      fieldType: prop.fieldType as SchemaField["fieldType"],
      label: prop.title as string | undefined,
      minItems: prop.minItems as number | undefined,
      maxItems: prop.maxItems as number | undefined,
      arrayItemType: prop.arrayItemType as "Image" | "File" | undefined,
    };
  });
};

/* -------------------------------------------------------------------------------------------------
 * ItemFieldsEditor — reusable field renderer for any depth
 * -----------------------------------------------------------------------------------------------*/

interface ItemFieldsEditorProps {
  schema: unknown;
  data: Record<string, unknown>;
  blockId: string;
  /** When editing a repeatable item's fields, pass its ID for correct overlay targeting */
  itemId?: string;
  onFieldChange: (fieldName: string, value: unknown) => void;
  postToIframe: (message: OverlayMessage) => void;
  /** Lookup maps for resolving _fileId and _itemId markers */
  filesMap: Map<number, NormalizedFile>;
  itemsMap: Map<number, NormalizedItem>;
}

const ItemFieldsEditor = ({
  schema,
  data,
  blockId,
  itemId,
  onFieldChange,
  postToIframe,
  filesMap,
  itemsMap,
}: ItemFieldsEditorProps) => {
  const fields = React.useMemo(() => getSchemaFieldsInOrder(schema), [schema]);
  const timerRef = React.useRef<number | null>(null);
  const focusedFieldIdRef = React.useRef<string | null>(null);

  // Build field ID matching the iframe's getOverlayFieldId format
  const getFieldId = (fieldName: string) => {
    if (itemId) return `${blockId}__${itemId}__${fieldName}`;
    return `${blockId}__${fieldName}`;
  };

  const scalarFields = React.useMemo(() => {
    return fields
      .filter((f) => f.fieldType === "String" || f.fieldType === "Embed")
      .map((f) => f.name);
  }, [fields]);

  const defaultValues = React.useMemo(() => {
    const values: Record<string, unknown> = {};
    for (const fieldName of scalarFields) {
      values[fieldName] = data[fieldName] ?? "";
    }
    return values;
  }, [data, scalarFields]);

  const form = useForm({ defaultValues });

  React.useEffect(() => {
    form.update({ defaultValues });
  }, [defaultValues, form]);

  // Clear any focused field overlay on unmount (e.g. when sheet closes)
  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (focusedFieldIdRef.current) {
        postToIframe({
          type: "CAMOX_FOCUS_FIELD_END",
          fieldId: focusedFieldIdRef.current,
        });
      }
    };
  }, [postToIframe]);

  const handleScalarChange = (fieldName: string, value: unknown, fieldApi: any) => {
    fieldApi.handleChange(value);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      onFieldChange(fieldName, value);
    }, 500);
  };

  const handleFieldFocus = (fieldName: string, fieldType: FieldType) => {
    const fieldId = getFieldId(fieldName);
    focusedFieldIdRef.current = fieldId;
    postToIframe({ type: "CAMOX_FOCUS_FIELD", fieldId });
    if (itemId) {
      previewStore.send({ type: "selectItemField", blockId, itemId, fieldName, fieldType });
    } else {
      previewStore.send({ type: "selectBlockField", blockId, fieldName, fieldType });
    }
  };

  const handleFieldBlur = (fieldName: string) => {
    const fieldId = getFieldId(fieldName);
    focusedFieldIdRef.current = null;
    postToIframe({ type: "CAMOX_FOCUS_FIELD_END", fieldId });
    // Defer so that if another field immediately takes focus, its handleFieldFocus
    // sets focusedFieldIdRef before this fires — avoiding a flash to parent.
    requestAnimationFrame(() => {
      if (!focusedFieldIdRef.current) {
        previewStore.send({ type: "selectParent" });
      }
    });
  };

  /** Dispatch the correct drill-into event depending on whether we're at block or item level. */
  const drillIntoField = (fieldName: string, fieldType: "Link" | "Image" | "File") => {
    if (itemId) {
      previewStore.send({
        type: "selectItemField",
        blockId,
        itemId,
        fieldName,
        fieldType,
      });
    } else {
      previewStore.send({
        type: "selectBlockField",
        blockId,
        fieldName,
        fieldType,
      });
    }
  };

  return (
    <form className="space-y-4 px-4 py-4">
      {fields.map((field) => {
        const label = field.label ?? formatFieldName(field.name);
        const fieldId = getFieldId(field.name);

        if (field.fieldType === "String") {
          return (
            <form.Field key={field.name} name={field.name}>
              {(fieldApi) => (
                <div
                  className="space-y-2"
                  onMouseEnter={() =>
                    postToIframe({
                      type: "CAMOX_HOVER_FIELD",
                      fieldId,
                    })
                  }
                  onMouseLeave={() =>
                    postToIframe({
                      type: "CAMOX_HOVER_FIELD_END",
                      fieldId,
                    })
                  }
                >
                  <Label htmlFor={field.name}>{label}</Label>
                  <SidebarLexicalEditor
                    value={fieldApi.state.value as string | Record<string, unknown>}
                    onChange={(value) => handleScalarChange(field.name, value, fieldApi)}
                    onFocus={() => handleFieldFocus(field.name, field.fieldType as FieldType)}
                    onBlur={() => handleFieldBlur(field.name)}
                  />
                </div>
              )}
            </form.Field>
          );
        }

        if (field.fieldType === "Embed") {
          return (
            <form.Field key={field.name} name={field.name}>
              {(fieldApi) => (
                <div
                  className="space-y-2"
                  onMouseEnter={() =>
                    postToIframe({
                      type: "CAMOX_HOVER_FIELD",
                      fieldId,
                    })
                  }
                  onMouseLeave={() =>
                    postToIframe({
                      type: "CAMOX_HOVER_FIELD_END",
                      fieldId,
                    })
                  }
                >
                  <Label htmlFor={field.name}>{label}</Label>
                  <Input
                    id={field.name}
                    type="url"
                    value={fieldApi.state.value as string}
                    onChange={(e) => handleScalarChange(field.name, e.target.value, fieldApi)}
                    onFocus={() => handleFieldFocus(field.name, field.fieldType as FieldType)}
                    onBlur={() => handleFieldBlur(field.name)}
                  />
                </div>
              )}
            </form.Field>
          );
        }

        if (field.fieldType === "Link") {
          const linkValue = data[field.name] as
            | { text: string; href: string; newTab: boolean }
            | undefined;

          const preview = linkValue?.text || linkValue?.href || "Empty link";

          return (
            <div
              key={field.name}
              className="space-y-2"
              onMouseEnter={() =>
                postToIframe({
                  type: "CAMOX_HOVER_FIELD",
                  fieldId,
                })
              }
              onMouseLeave={() =>
                postToIframe({
                  type: "CAMOX_HOVER_FIELD_END",
                  fieldId,
                })
              }
            >
              <Label>{label}</Label>
              <button
                type="button"
                className="hover:bg-accent/75 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors"
                onClick={() => drillIntoField(field.name, "Link")}
              >
                <Link2Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="truncate">{preview}</span>
              </button>
            </div>
          );
        }

        if (field.fieldType === "RepeatableItem" && field.arrayItemType === "Image") {
          const items = (data[field.name] ?? []) as unknown[];
          const count = items.length;
          let preview: string;
          if (count === 0) {
            preview = "No images";
          } else if (count === 1) {
            preview = "1 image";
          } else {
            preview = `${count} images`;
          }

          return (
            <div
              key={field.name}
              className="space-y-2"
              onMouseEnter={() =>
                postToIframe({
                  type: "CAMOX_HOVER_REPEATER",
                  blockId,
                  fieldName: field.name,
                })
              }
              onMouseLeave={() =>
                postToIframe({
                  type: "CAMOX_HOVER_REPEATER_END",
                  blockId,
                  fieldName: field.name,
                })
              }
            >
              <Label>{label}</Label>
              <button
                type="button"
                className="hover:bg-accent/75 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors"
                onClick={() => drillIntoField(field.name, "Image")}
              >
                <ImagesIcon className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="truncate">{preview}</span>
              </button>
            </div>
          );
        }

        if (field.fieldType === "RepeatableItem" && field.arrayItemType === "File") {
          const items = (data[field.name] ?? []) as unknown[];
          const count = items.length;
          let preview: string;
          if (count === 0) {
            preview = "No files";
          } else if (count === 1) {
            preview = "1 file";
          } else {
            preview = `${count} files`;
          }

          return (
            <div
              key={field.name}
              className="space-y-2"
              onMouseEnter={() =>
                postToIframe({
                  type: "CAMOX_HOVER_REPEATER",
                  blockId,
                  fieldName: field.name,
                })
              }
              onMouseLeave={() =>
                postToIframe({
                  type: "CAMOX_HOVER_REPEATER_END",
                  blockId,
                  fieldName: field.name,
                })
              }
            >
              <Label>{label}</Label>
              <button
                type="button"
                className="hover:bg-accent/75 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors"
                onClick={() => drillIntoField(field.name, "File")}
              >
                <FileIcon className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="truncate">{preview}</span>
              </button>
            </div>
          );
        }

        if (field.fieldType === "Image") {
          const rawImage = data[field.name];
          const imageValue = isFileMarker(rawImage)
            ? resolveFileMarker(rawImage, filesMap)
            : (rawImage as { filename?: string } | undefined);
          const preview = imageValue?.filename || "No image";

          return (
            <div
              key={field.name}
              className="space-y-2"
              onMouseEnter={() =>
                postToIframe({
                  type: "CAMOX_HOVER_FIELD",
                  fieldId,
                })
              }
              onMouseLeave={() =>
                postToIframe({
                  type: "CAMOX_HOVER_FIELD_END",
                  fieldId,
                })
              }
            >
              <Label>{label}</Label>
              <button
                type="button"
                className="hover:bg-accent/75 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors"
                onClick={() => drillIntoField(field.name, "Image")}
              >
                <ImageIcon className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="truncate">{preview}</span>
              </button>
            </div>
          );
        }

        if (field.fieldType === "File") {
          const rawFile = data[field.name];
          const fileValue = isFileMarker(rawFile)
            ? resolveFileMarker(rawFile, filesMap)
            : (rawFile as { filename?: string } | undefined);
          const preview = fileValue?.filename || "No file";

          return (
            <div
              key={field.name}
              className="space-y-2"
              onMouseEnter={() =>
                postToIframe({
                  type: "CAMOX_HOVER_FIELD",
                  fieldId,
                })
              }
              onMouseLeave={() =>
                postToIframe({
                  type: "CAMOX_HOVER_FIELD_END",
                  fieldId,
                })
              }
            >
              <Label>{label}</Label>
              <button
                type="button"
                className="hover:bg-accent/75 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors"
                onClick={() => drillIntoField(field.name, "File")}
              >
                <FileIcon className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="truncate">{preview}</span>
              </button>
            </div>
          );
        }

        if (field.fieldType === "RepeatableItem") {
          const rawItems = (data[field.name] ?? []) as any[];
          // Resolve _itemId markers to full item objects
          const items = rawItems
            .map((item: any) => {
              if (isItemMarker(item)) {
                return itemsMap.get(item._itemId) ?? null;
              }
              return item;
            })
            .filter(Boolean) as Array<{
            id: number;
            summary: string;
            position: string;
            content: Record<string, unknown>;
          }>;
          const fieldSchema = (schema as any)?.properties?.[field.name];

          return (
            <div key={field.name} className="space-y-2">
              <Label>{label}</Label>
              <RepeatableItemsList
                items={items}
                blockId={blockId}
                fieldName={field.name}
                minItems={field.minItems}
                maxItems={field.maxItems}
                schema={fieldSchema}
              />
            </div>
          );
        }

        return null;
      })}
    </form>
  );
};

export { ItemFieldsEditor };
