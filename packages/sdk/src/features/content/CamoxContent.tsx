import { useState } from "react";
import { useQuery } from "convex/react";

import { api } from "camox/_generated/api";
import type { Id } from "camox/_generated/dataModel";
import { PanelContent } from "@/components/ui/panel";
import { AssetLightbox } from "@/features/preview/components/AssetLightbox";
import { ContentSidebar } from "./components/ContentSidebar";
import { AssetCard } from "./components/AssetCard";

export const CamoxContent = () => {
  const files = useQuery(api.files.listFiles);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lightboxFileId, setLightboxFileId] = useState<Id<"files"> | null>(
    null,
  );

  return (
    <div className="flex-1 flex flex-row">
      <ContentSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <PanelContent
          className="p-4"
          onClick={() => setSelectedIds(new Set())}
        >
          {files === undefined ? null : files.length === 0 ? (
            <div className="flex-1 flex items-center justify-center h-full">
              <p className="text-muted-foreground">No assets yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
              {files.map((file) => (
                <AssetCard
                  key={file._id}
                  file={file}
                  selected={selectedIds.has(file._id)}
                  onSelect={() => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(file._id)) {
                        next.delete(file._id);
                      } else {
                        next.add(file._id);
                      }
                      return next;
                    });
                  }}
                  onOpen={() => setLightboxFileId(file._id)}
                />
              ))}
            </div>
          )}
        </PanelContent>
      </div>
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
