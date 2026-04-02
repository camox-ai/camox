import * as React from "react";

import type { PageWithBlocks } from "./queries";

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
 * Hook for building maps from page data (used by editing UI components)
 * -----------------------------------------------------------------------------------------------*/

export function useNormalizedMaps(pageData: PageWithBlocks) {
  return React.useMemo(
    () => ({
      filesMap: new Map(pageData.files.map((f) => [f.id, f])),
      itemsMap: new Map(pageData.repeatableItems.map((i) => [i.id, i])),
    }),
    [pageData.files, pageData.repeatableItems],
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helper: resolve page/layout blocks from normalized response
 * -----------------------------------------------------------------------------------------------*/

export function usePageBlocks(pageData: PageWithBlocks) {
  return React.useMemo(() => {
    const blocksMap = new Map(pageData.blocks.map((b) => [b.id, b]));
    const pageBlocks = pageData.page.blockIds
      .map((id) => blocksMap.get(id))
      .filter((b): b is NormalizedBlock => b != null);
    const beforeBlocks = pageData.layout
      ? pageData.layout.beforeBlockIds
          .map((id) => blocksMap.get(id))
          .filter((b): b is NormalizedBlock => b != null)
      : [];
    const afterBlocks = pageData.layout
      ? pageData.layout.afterBlockIds
          .map((id) => blocksMap.get(id))
          .filter((b): b is NormalizedBlock => b != null)
      : [];
    return { pageBlocks, beforeBlocks, afterBlocks, allBlocks: pageData.blocks };
  }, [pageData]);
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
