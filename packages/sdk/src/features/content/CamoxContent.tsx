import { PanelContent } from "@camox/ui/panel";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import { AssetLightbox } from "@/features/preview/components/AssetLightbox";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useMarqueeSelection } from "@/hooks/use-marquee-selection";
import { useApiClient } from "@/lib/api-client";
import { fileQueries } from "@/lib/queries";

import { AssetCard } from "./components/AssetCard";
import { AssetCardSkeleton } from "./components/AssetCardSkeleton";
import { ContentSidebar } from "./components/ContentSidebar";
import { UploadDropZone } from "./components/UploadDropZone";
import { UploadProgressDrawer } from "./components/UploadProgressDrawer";

export const CamoxContent = () => {
  const apiClient = useApiClient();
  const { data: files } = useQuery(fileQueries.list(apiClient));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lightboxFileId, setLightboxFileId] = useState<number | null>(null);
  const { uploads, uploadFiles, clearAll } = useFileUpload();
  const containerRef = useRef<HTMLElement | null>(null);
  const { selectionRect, didDragRef, handlers } = useMarqueeSelection(
    containerRef,
    useCallback((ids: Set<string>) => setSelectedIds(ids), []),
  );

  return (
    <div className="flex flex-1 flex-row">
      <ContentSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <UploadDropZone onDrop={uploadFiles} className="flex flex-1 flex-col">
          <PanelContent
            ref={containerRef}
            className="relative p-4 select-none"
            onClick={() => {
              if (didDragRef.current) {
                didDragRef.current = false;
                return;
              }
              setSelectedIds(new Set());
            }}
            onPointerDown={handlers.onPointerDown}
            onPointerMove={handlers.onPointerMove}
            onPointerUp={handlers.onPointerUp}
          >
            {files === undefined && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                {Array.from({ length: 12 }, (_, i) => (
                  <AssetCardSkeleton key={i} />
                ))}
              </div>
            )}
            {files?.length === 0 && (
              <div className="flex h-full flex-1 items-center justify-center">
                <p className="text-muted-foreground">No assets yet</p>
              </div>
            )}
            {files && files.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                {files.map((file) => (
                  <AssetCard
                    key={file.id}
                    file={file}
                    selected={selectedIds.has(String(file.id))}
                    onSelect={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(String(file.id))) {
                          next.delete(String(file.id));
                        } else {
                          next.add(String(file.id));
                        }
                        return next;
                      });
                    }}
                    onOpen={() => setLightboxFileId(file.id)}
                  />
                ))}
              </div>
            )}
            {selectionRect && (
              <div
                className="border-primary bg-primary/10 pointer-events-none absolute z-50 border"
                style={{
                  left: selectionRect.left,
                  top: selectionRect.top,
                  width: selectionRect.width,
                  height: selectionRect.height,
                }}
              />
            )}
          </PanelContent>
        </UploadDropZone>
      </div>
      <UploadProgressDrawer uploads={uploads} onClose={clearAll} />
      {lightboxFileId && (
        <AssetLightbox
          open
          onOpenChange={(open) => {
            if (!open) setLightboxFileId(null);
          }}
          fileId={lightboxFileId}
        />
      )}
    </div>
  );
};
