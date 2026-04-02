import { queryKeys } from "@camox/api/query-keys";
import type { QueryClient } from "@tanstack/react-query";
import { useQueries } from "@tanstack/react-query";
import * as React from "react";

import type { BlockBundle, PageStructure, PageWithBlocks } from "./queries";
import { blockQueries } from "./queries";

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

export type NormalizedFile = PageWithBlocks["files"][number];
export type NormalizedItem = PageWithBlocks["repeatableItems"][number];
export type NormalizedBlock = PageWithBlocks["blocks"][number];

/* -------------------------------------------------------------------------------------------------
 * Context for block rendering (inside iframe)
 * Provides file/item lookup maps so createBlock components can resolve markers.
 * -----------------------------------------------------------------------------------------------*/

interface NormalizedDataContextValue {
  filesMap: Map<number, NormalizedFile>;
  itemsMap: Map<number, NormalizedItem>;
}

const NormalizedDataContext = React.createContext<NormalizedDataContextValue>({
  filesMap: new Map(),
  itemsMap: new Map(),
});

export const NormalizedDataProvider = ({
  files,
  repeatableItems,
  children,
}: {
  files: NormalizedFile[];
  repeatableItems: NormalizedItem[];
  children: React.ReactNode;
}) => {
  const value = React.useMemo(
    () => ({
      filesMap: new Map(files.map((f) => [f.id, f])),
      itemsMap: new Map(repeatableItems.map((i) => [i.id, i])),
    }),
    [files, repeatableItems],
  );

  return React.createElement(NormalizedDataContext.Provider, { value }, children);
};

export function useNormalizedData() {
  return React.use(NormalizedDataContext);
}

/* -------------------------------------------------------------------------------------------------
 * Helper: resolve page/layout blocks from individual block caches
 * Uses useQueries to subscribe to each block's cache entry.
 * -----------------------------------------------------------------------------------------------*/

const EMPTY_IDS: number[] = [];

export function usePageBlocks(pageStructure: PageStructure) {
  const blockIds = pageStructure.page.blockIds;
  const beforeIds = pageStructure.layout?.beforeBlockIds ?? EMPTY_IDS;
  const afterIds = pageStructure.layout?.afterBlockIds ?? EMPTY_IDS;

  const allIds = React.useMemo(
    () => [...blockIds, ...beforeIds, ...afterIds],
    [blockIds, beforeIds, afterIds],
  );

  const results = useQueries({
    queries: allIds.map((id) => blockQueries.get(id)),
  });

  return React.useMemo(() => {
    const bundleMap = new Map<number, BlockBundle>();
    for (let i = 0; i < allIds.length; i++) {
      const data = results[i]?.data;
      if (data) bundleMap.set(allIds[i], data);
    }

    // Merge files and items from layout block bundles for NormalizedDataProvider
    const layoutFiles: NormalizedFile[] = [];
    const layoutItems: NormalizedItem[] = [];
    for (const id of [...beforeIds, ...afterIds]) {
      const bundle = bundleMap.get(id);
      if (bundle) {
        layoutFiles.push(...bundle.files);
        layoutItems.push(...bundle.repeatableItems);
      }
    }

    return {
      pageBlocks: blockIds
        .map((id) => bundleMap.get(id)?.block)
        .filter((b): b is NormalizedBlock => b != null),
      beforeBlocks: beforeIds
        .map((id) => bundleMap.get(id)?.block)
        .filter((b): b is NormalizedBlock => b != null),
      afterBlocks: afterIds
        .map((id) => bundleMap.get(id)?.block)
        .filter((b): b is NormalizedBlock => b != null),
      layoutFiles,
      layoutItems,
    };
  }, [results, allIds, blockIds, beforeIds, afterIds]);
}

/* -------------------------------------------------------------------------------------------------
 * Marker resolution helpers
 * -----------------------------------------------------------------------------------------------*/

/** Check if a value is a { _fileId } marker */
export function isFileMarker(value: unknown): value is { _fileId: number } {
  return (
    value != null &&
    typeof value === "object" &&
    "_fileId" in (value as Record<string, unknown>) &&
    (value as Record<string, unknown>)._fileId != null
  );
}

/** Check if a value is a { _itemId } marker */
export function isItemMarker(value: unknown): value is { _itemId: number } {
  return (
    value != null &&
    typeof value === "object" &&
    "_itemId" in (value as Record<string, unknown>) &&
    (value as Record<string, unknown>)._itemId != null
  );
}

/* -------------------------------------------------------------------------------------------------
 * Seed individual block caches from page response
 * Each block gets its own cache entry matching the blocks.get endpoint shape.
 * This enables granular invalidation — content edits refetch only the affected block.
 * -----------------------------------------------------------------------------------------------*/

function collectFileIdsFromContent(content: Record<string, unknown>, ids: Set<number>) {
  for (const value of Object.values(content)) {
    if (value != null && typeof value === "object") {
      if ("_fileId" in value && typeof (value as any)._fileId === "number") {
        ids.add((value as any)._fileId);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (item != null && typeof item === "object") {
            collectFileIdsFromContent(item as Record<string, unknown>, ids);
          }
        }
      } else {
        collectFileIdsFromContent(value as Record<string, unknown>, ids);
      }
    }
  }
}

export function seedBlockCaches(queryClient: QueryClient, pageData: PageWithBlocks) {
  const filesById = new Map(pageData.files.map((f) => [f.id, f]));

  for (const block of pageData.blocks) {
    const blockItems = pageData.repeatableItems.filter((i) => i.blockId === block.id);

    // Collect file IDs referenced by this block and its items
    const fileIds = new Set<number>();
    collectFileIdsFromContent(block.content as Record<string, unknown>, fileIds);
    for (const item of blockItems) {
      collectFileIdsFromContent(item.content as Record<string, unknown>, fileIds);
    }
    const blockFiles = [...fileIds].map((id) => filesById.get(id)).filter((f) => f != null);

    queryClient.setQueryData(queryKeys.blocks.get(block.id), {
      block,
      repeatableItems: blockItems,
      files: blockFiles,
    });

    for (const file of blockFiles) {
      queryClient.setQueryData(queryKeys.files.get(file.id), file);
    }
  }
}

/** Resolve a file marker to a full file object */
export function resolveFileMarker(
  marker: { _fileId: number },
  filesMap: Map<number, NormalizedFile>,
): { url: string; alt: string; filename: string; mimeType: string; _fileId: number } {
  const file = filesMap.get(marker._fileId);
  if (file) {
    return {
      url: file.url,
      alt: file.alt,
      filename: file.filename,
      mimeType: file.mimeType,
      _fileId: marker._fileId,
    };
  }
  return { url: "", alt: "", filename: "", mimeType: "", _fileId: marker._fileId };
}
