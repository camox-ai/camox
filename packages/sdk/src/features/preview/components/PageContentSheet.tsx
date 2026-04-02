import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@camox/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@camox/ui/dropdown-menu";
import { Label } from "@camox/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@camox/ui/select";
import { Switch } from "@camox/ui/switch";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { useSelector } from "@xstate/store/react";
import * as React from "react";

import { actionsStore, type Action } from "@/features/provider/actionsStore";
import { trackClientEvent } from "@/lib/analytics-client";
import { isFileMarker, type NormalizedItem } from "@/lib/normalized-data";
import { blockMutations, blockQueries, fileQueries, repeatableItemMutations } from "@/lib/queries";

import { useCamoxApp } from "../../provider/components/CamoxAppContext";
import { usePreviewedPage } from "../CamoxPreview";
import type { OverlayMessage } from "../overlayMessages";
import { previewStore, selectionBlockId, selectionField, selectionItemId } from "../previewStore";
import { SingleAssetFieldEditor } from "./AssetFieldEditor";
import { type SchemaField, formatFieldName } from "./ItemFieldsEditor";
import { ItemFieldsEditor } from "./ItemFieldsEditor";
import { LinkFieldEditor } from "./LinkFieldEditor";
import { MultipleAssetFieldEditor } from "./MultipleAssetFieldEditor";
import { PreviewSideSheet, SheetParts } from "./PreviewSideSheet";

/* -------------------------------------------------------------------------------------------------
 * Helper: Get settings fields from schema
 * -----------------------------------------------------------------------------------------------*/

const getSettingsFields = (schema: unknown): SchemaField[] => {
  const properties = (schema as any)?.properties;
  if (!properties) return [];

  return Object.keys(properties).map((fieldName) => {
    const prop = properties[fieldName] as any;
    return {
      name: fieldName,
      fieldType: prop.fieldType as SchemaField["fieldType"],
      label: prop.title as string | undefined,
      enumLabels: prop.enumLabels as Record<string, string> | undefined,
      enumValues: prop.enum as string[] | undefined,
      arrayItemType: prop.arrayItemType as "Image" | "File" | undefined,
    };
  });
};

/* -------------------------------------------------------------------------------------------------
 * Schema traversal helper — walk up parent chain to find schema for an item
 * -----------------------------------------------------------------------------------------------*/

/**
 * Builds the path of fieldNames from the block root to the given item,
 * then walks the schema down that path to return the sub-schema for the item's fields.
 */
const getSchemaForItem = (
  contentSchema: unknown,
  itemId: number,
  itemsMap: Map<number, NormalizedItem>,
): unknown => {
  // Build path from root to this item
  const path: string[] = [];
  let current = itemsMap.get(itemId);
  while (current) {
    path.unshift(current.fieldName);
    current = current.parentItemId ? itemsMap.get(current.parentItemId) : undefined;
  }

  // Walk schema down the path
  let schema = contentSchema;
  for (const fieldName of path) {
    const prop = (schema as any)?.properties?.[fieldName];
    if (!prop?.items) return null;
    schema = prop.items;
  }
  return schema;
};

/**
 * Builds the ancestor chain from root to this item (inclusive).
 * Returns items in order from root-most ancestor to the item itself.
 */
const buildAncestorChain = (
  itemId: number,
  itemsMap: Map<number, NormalizedItem>,
): NormalizedItem[] => {
  const chain: NormalizedItem[] = [];
  let current = itemsMap.get(itemId);
  while (current) {
    chain.unshift(current);
    current = current.parentItemId ? itemsMap.get(current.parentItemId) : undefined;
  }
  return chain;
};

/* -------------------------------------------------------------------------------------------------
 * PageContentSheet
 * -----------------------------------------------------------------------------------------------*/

const PageContentSheet = () => {
  const camoxApp = useCamoxApp();
  const updateContent = useMutation(blockMutations.updateContent());
  const updateSettings = useMutation(blockMutations.updateSettings());
  const updateRepeatableContent = useMutation(repeatableItemMutations.updateContent());

  // Get state from store
  const isOpen = useSelector(previewStore, (state) => state.context.isPageContentSheetOpen);
  const selection = useSelector(previewStore, (state) => state.context.selection);
  const iframeElement = useSelector(previewStore, (state) => state.context.iframeElement);

  const postToIframe = React.useCallback(
    (message: OverlayMessage) => {
      if (!iframeElement?.contentWindow) return;
      iframeElement.contentWindow.postMessage(message, "*");
    },
    [iframeElement],
  );

  const blockId = selectionBlockId(selection);
  const currentItemId = selectionItemId(selection);
  const fieldInfo = selectionField(selection);

  // Look up the actual block data from individual block cache (granular caching)
  const page = usePreviewedPage();
  const numericBlockId = blockId ? Number(blockId) : undefined;
  const { data: blockBundle } = useQuery({
    ...blockQueries.get(numericBlockId!),
    enabled: numericBlockId != null,
  });
  const block = blockBundle?.block ?? null;
  const itemsMap = React.useMemo(
    () => new Map((blockBundle?.repeatableItems ?? []).map((i) => [i.id, i])),
    [blockBundle?.repeatableItems],
  );
  const fileIds = React.useMemo(
    () => (blockBundle?.files ?? []).map((f) => f.id),
    [blockBundle?.files],
  );

  const fileResults = useQueries({
    queries: fileIds.map((id) => fileQueries.get(id)),
  });

  const filesMap = React.useMemo(() => {
    const map = new Map((blockBundle?.files ?? []).map((f) => [f.id, f]));
    for (let i = 0; i < fileIds.length; i++) {
      const data = fileResults[i]?.data;
      if (data) map.set(data.id, data);
    }
    return map;
  }, [blockBundle?.files, fileIds, fileResults]);

  // Get block definition
  const blockDef = block ? camoxApp.getBlockById(block.type) : null;

  const settingsFields = React.useMemo(() => {
    return blockDef ? getSettingsFields(blockDef.settingsSchema) : [];
  }, [blockDef]);

  // Compute schema and data based on selection
  const currentSchema = React.useMemo(() => {
    if (!blockDef) return null;
    if (!currentItemId) return blockDef.contentSchema;
    return getSchemaForItem(blockDef.contentSchema, Number(currentItemId), itemsMap);
  }, [blockDef, currentItemId, itemsMap]);

  const currentItem = currentItemId ? itemsMap.get(Number(currentItemId)) : null;

  const rawCurrentData: Record<string, unknown> = currentItem
    ? (currentItem.content as Record<string, unknown>)
    : (block?.content ?? {});

  // Resolve _fileId markers in data for asset field editors (recursive for inline arrays)
  const currentData = React.useMemo(() => {
    const resolveFile = (marker: { _fileId: number }) => {
      const file = filesMap.get(marker._fileId);
      return file
        ? {
            url: file.url,
            alt: file.alt,
            filename: file.filename,
            mimeType: file.mimeType,
            _fileId: marker._fileId,
          }
        : { url: "", alt: "", filename: "", mimeType: "" };
    };

    const resolveValue = (value: unknown): unknown => {
      if (isFileMarker(value)) return resolveFile(value);
      if (Array.isArray(value)) return value.map(resolveValue);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        const resolved: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          resolved[k] = resolveValue(v);
        }
        return resolved;
      }
      return value;
    };

    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawCurrentData)) {
      resolved[key] = resolveValue(value);
    }
    return resolved;
  }, [rawCurrentData, filesMap]);

  // Detect terminal field view
  const isViewingLink = fieldInfo?.fieldType === "Link";
  const linkFieldName = isViewingLink ? fieldInfo.fieldName : null;

  const isViewingImage = fieldInfo?.fieldType === "Image";
  const imageFieldName = isViewingImage ? fieldInfo.fieldName : null;

  const isViewingFile = fieldInfo?.fieldType === "File";
  const fileFieldName = isViewingFile ? fieldInfo.fieldName : null;

  const isViewingAsset = isViewingImage || isViewingFile;
  const assetFieldName = imageFieldName ?? fileFieldName;
  const assetType: "Image" | "File" = isViewingImage ? "Image" : "File";

  const isMultipleAsset = React.useMemo(() => {
    if (!isViewingAsset || !assetFieldName || !blockDef) return false;
    // Get the schema at the current level (block or item)
    const schema = currentItemId
      ? getSchemaForItem(blockDef.contentSchema, Number(currentItemId), itemsMap)
      : blockDef.contentSchema;
    const prop = (schema as any)?.properties?.[assetFieldName];
    return prop?.arrayItemType === "Image" || prop?.arrayItemType === "File";
  }, [isViewingAsset, assetFieldName, blockDef, currentItemId, itemsMap]);

  // Track content sheet open
  React.useEffect(() => {
    if (isOpen && block) {
      trackClientEvent("content_sheet_opened", {
        projectId: page?.page.projectId,
        blockType: block.type,
      });
    }
  }, [isOpen, block, page?.page.projectId]);

  // Auto-focus selected field when sheet opens
  const autoFocusFieldName =
    selection?.type === "block-field" && selection.fieldType === "String"
      ? selection.fieldName
      : null;

  const handleOpenAutoFocus = React.useCallback(
    (e: Event) => {
      e.preventDefault();
      if (!autoFocusFieldName) return;
      setTimeout(() => {
        const element = document.getElementById(autoFocusFieldName) as HTMLTextAreaElement | null;
        if (!element) return;
        element.focus();
        element.select();
      }, 100);
    },
    [autoFocusFieldName],
  );

  // Register action to toggle content sheet for current selection
  React.useEffect(() => {
    const action: Action = {
      id: "open-content-sheet",
      label: isOpen ? "Close content sheet" : "Open content sheet",
      groupLabel: "Preview",
      icon: "PanelLeft",
      shortcut: { key: "j", withMeta: true },
      checkIfAvailable: () => isOpen || !!blockId,
      execute: () => {
        if (!blockId) return;
        previewStore.send({ type: "toggleContentSheet" });
      },
    };

    actionsStore.send({ type: "registerAction", action });
    return () => actionsStore.send({ type: "unregisterAction", id: action.id });
  }, [blockId, isOpen]);

  const handleBlockFieldChange = React.useCallback(
    (fieldName: string, value: unknown) => {
      if (!block) return;
      updateContent.mutate({ id: block.id, content: { [fieldName]: value } });
    },
    [block, updateContent],
  );

  const handleItemFieldChange = React.useCallback(
    (fieldName: string, value: unknown) => {
      if (!currentItemId) return;
      updateRepeatableContent.mutate({
        id: Number(currentItemId),
        content: { [fieldName]: value },
      });
    },
    [currentItemId, updateRepeatableContent],
  );

  const activeFieldChangeHandler = currentItemId ? handleItemFieldChange : handleBlockFieldChange;

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    if (block && autoFocusFieldName) {
      const fieldId = currentItemId
        ? `${String(block.id)}__${currentItemId}__${autoFocusFieldName}`
        : `${String(block.id)}__${autoFocusFieldName}`;
      postToIframe({ type: "CAMOX_FOCUS_FIELD_END", fieldId });
    }
    // Clear any lingering hover/focus overlays for the current item
    if (block && currentItemId) {
      postToIframe({
        type: "CAMOX_HOVER_REPEATER_ITEM_END",
        blockId: String(block.id),
        itemId: currentItemId,
      });
    }
    previewStore.send({ type: "closeBlockContentSheet" });
  };

  if (!block || !blockDef || !currentSchema) {
    return null;
  }

  // Build breadcrumb display from the ancestor chain
  const ancestorChain = currentItemId ? buildAncestorChain(Number(currentItemId), itemsMap) : [];
  const isAtBlockLevel = ancestorChain.length === 0 && !fieldInfo;

  return (
    <PreviewSideSheet
      open={isOpen}
      onOpenChange={handleOpenChange}
      onOpenAutoFocus={handleOpenAutoFocus}
      className="flex flex-col gap-0"
    >
      <SheetParts.SheetHeader className="border-border border-b">
        <SheetParts.SheetTitle>{block.summary}</SheetParts.SheetTitle>
        <SheetParts.SheetDescription asChild>
          <Breadcrumb>
            <BreadcrumbList className="flex-nowrap">
              {/* Block title — always shown */}
              <BreadcrumbItem className="min-w-0">
                {isAtBlockLevel ? (
                  <BreadcrumbPage className="truncate">{blockDef.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="cursor-pointer"
                    onClick={() =>
                      previewStore.send({ type: "setFocusedBlock", blockId: String(block.id) })
                    }
                  >
                    {blockDef.title}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>

              {/* Ancestor items — ellipsis dropdown for deep nesting */}
              {ancestorChain.length > 0 && (
                <>
                  {ancestorChain.length > 1 && (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="flex items-center gap-1">
                            <BreadcrumbEllipsis className="size-5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {ancestorChain.slice(0, -1).map((ancestor) => (
                              <DropdownMenuItem
                                key={ancestor.id}
                                onClick={() =>
                                  previewStore.send({
                                    type: "selectItem",
                                    blockId: String(block.id),
                                    itemId: String(ancestor.id),
                                  })
                                }
                              >
                                {ancestor.summary || formatFieldName(ancestor.fieldName)}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </BreadcrumbItem>
                    </>
                  )}
                  <BreadcrumbSeparator />
                  {(() => {
                    const lastAncestor = ancestorChain[ancestorChain.length - 1];
                    const crumbLabel =
                      lastAncestor.summary || formatFieldName(lastAncestor.fieldName);

                    if (fieldInfo) {
                      // Viewing a field within this item — item is clickable
                      return (
                        <BreadcrumbItem className="min-w-0">
                          <BreadcrumbLink
                            className="cursor-pointer truncate"
                            onClick={() => previewStore.send({ type: "selectParent" })}
                          >
                            {crumbLabel}
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                      );
                    }

                    // Viewing the item itself — it's the current page
                    return (
                      <BreadcrumbItem className="min-w-0">
                        <BreadcrumbPage className="truncate">{crumbLabel}</BreadcrumbPage>
                      </BreadcrumbItem>
                    );
                  })()}
                </>
              )}

              {/* Terminal field (Link/Image/File) */}
              {fieldInfo && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbPage className="truncate">
                      {(() => {
                        const schema = currentItemId
                          ? getSchemaForItem(
                              blockDef.contentSchema,
                              Number(currentItemId),
                              itemsMap,
                            )
                          : blockDef.contentSchema;
                        const prop = (schema as any)?.properties?.[fieldInfo.fieldName];
                        return prop?.title ?? formatFieldName(fieldInfo.fieldName);
                      })()}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </SheetParts.SheetDescription>
      </SheetParts.SheetHeader>
      <div className="flex-1 overflow-auto">
        {isViewingAsset && assetFieldName && isMultipleAsset && (
          <MultipleAssetFieldEditor
            fieldName={assetFieldName}
            assetType={assetType}
            currentData={currentData}
            onFieldChange={activeFieldChangeHandler}
          />
        )}
        {isViewingAsset && assetFieldName && !isMultipleAsset && (
          <SingleAssetFieldEditor
            fieldName={assetFieldName}
            assetType={assetType}
            currentData={currentData}
            onFieldChange={activeFieldChangeHandler}
          />
        )}
        {!isViewingAsset && isViewingLink && linkFieldName && (
          <div className="px-4 py-4">
            <LinkFieldEditor
              fieldName={linkFieldName}
              linkValue={
                (currentData[linkFieldName] as Record<string, unknown>) ??
                ({
                  type: "external",
                  text: "",
                  href: "",
                  newTab: false,
                } as Record<string, unknown>)
              }
              onSave={(fieldName, value) => {
                activeFieldChangeHandler(fieldName, value);
              }}
            />
          </div>
        )}
        {!isViewingAsset && !isViewingLink && (
          <ItemFieldsEditor
            schema={currentSchema}
            data={currentData}
            blockId={String(block.id)}
            itemId={currentItemId ?? undefined}
            onFieldChange={activeFieldChangeHandler}
            postToIframe={postToIframe}
            filesMap={filesMap}
            itemsMap={itemsMap}
          />
        )}
        {!currentItemId && !fieldInfo && settingsFields.length > 0 && (
          <div className="border-border space-y-4 border-t px-4 py-4">
            <Label className="text-muted-foreground">Settings</Label>
            {settingsFields.map((field) => {
              const label = field.label ?? formatFieldName(field.name);
              const settingsValues = (block.settings ?? {}) as Record<string, unknown>;

              if (field.fieldType === "Enum") {
                const value =
                  (settingsValues[field.name] as string | undefined) ??
                  (blockDef.settingsSchema?.properties?.[field.name] as any)?.default ??
                  "";

                return (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={`setting-${field.name}`}>{label}</Label>
                    <Select
                      value={value}
                      onValueChange={(newValue) => {
                        updateSettings.mutate({
                          id: block.id,
                          settings: { [field.name]: newValue },
                        });
                      }}
                    >
                      <SelectTrigger id={`setting-${field.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {field.enumValues?.map((enumValue) => (
                          <SelectItem key={enumValue} value={enumValue}>
                            {field.enumLabels?.[enumValue] ?? enumValue}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }

              if (field.fieldType === "Boolean") {
                const checked =
                  (settingsValues[field.name] as boolean | undefined) ??
                  (blockDef.settingsSchema?.properties?.[field.name] as any)?.default ??
                  false;

                return (
                  <div key={field.name} className="flex items-center justify-between">
                    <Label htmlFor={`setting-${field.name}`}>{label}</Label>
                    <Switch
                      id={`setting-${field.name}`}
                      checked={checked}
                      onCheckedChange={(newValue) => {
                        updateSettings.mutate({
                          id: block.id,
                          settings: { [field.name]: newValue },
                        });
                      }}
                    />
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}
      </div>
    </PreviewSideSheet>
  );
};

export { PageContentSheet };
