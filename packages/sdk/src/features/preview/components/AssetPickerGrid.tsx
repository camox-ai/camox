import { Button } from "@camox/ui/button";
import { Skeleton } from "@camox/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import * as React from "react";

import { AssetCard } from "@/features/content/components/AssetCard";
import { useProjectSlug } from "@/lib/auth";
import type { File } from "@/lib/queries";
import { fileQueries, projectQueries } from "@/lib/queries";

import { AssetLightbox } from "./AssetLightbox";

interface AssetPickerGridProps {
  assetType: "Image" | "File";
  mode: "single" | "multiple";
  onSelectSingle: (file: File) => void;
  onSelectMultiple: (files: File[]) => void;
  onClose: () => void;
}

const AssetPickerGrid = ({
  assetType,
  mode,
  onSelectSingle,
  onSelectMultiple,
  onClose,
}: AssetPickerGridProps) => {
  const projectSlug = useProjectSlug();
  const { data: project } = useQuery(projectQueries.getBySlug(projectSlug));
  const { data: allFiles } = useQuery({
    ...fileQueries.list(project?.id ?? 0),
    enabled: !!project,
  });
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
  const [lightboxFile, setLightboxFile] = React.useState<File | null>(null);

  const isImage = assetType === "Image";
  const files = React.useMemo(() => {
    if (!allFiles) return undefined;
    if (!isImage) return allFiles;
    return allFiles.filter((f) => f.mimeType?.startsWith("image/"));
  }, [allFiles, isImage]);

  const toggleSelection = (fileId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleConfirmMultiple = () => {
    if (!files) return;
    const selected = files.filter((f) => selectedIds.has(f.id));
    onSelectMultiple(selected);
  };

  const typeLabel = isImage ? "image" : "file";
  const typeLabelPlural = isImage ? "images" : "files";
  const title = mode === "multiple" ? `Select ${typeLabelPlural}` : `Select ${typeLabel}`;

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
          {title}
        </Button>
        {mode === "multiple" && (
          <Button
            variant="default"
            size="sm"
            className="ml-auto"
            disabled={selectedIds.size === 0}
            onClick={handleConfirmMultiple}
          >
            Add selected ({selectedIds.size})
          </Button>
        )}
      </div>

      <div className="px-4 pb-4">
        {files === undefined && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-lg p-2">
                <Skeleton className="aspect-4/3 w-full rounded-md" />
                <Skeleton className="h-3.5 w-3/4 rounded" />
              </div>
            ))}
          </div>
        )}
        {files?.length === 0 && (
          <p className="text-muted-foreground py-8 text-center text-sm">No assets yet</p>
        )}
        {files && files.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {files.map((file) => (
              <AssetCard
                key={file.id}
                file={file}
                selected={selectedIds.has(file.id)}
                onSelect={() => {
                  if (mode === "single") {
                    onSelectSingle(file);
                  } else {
                    toggleSelection(file.id);
                  }
                }}
                onOpen={() => setLightboxFile(file)}
              />
            ))}
          </div>
        )}
      </div>

      {lightboxFile && (
        <AssetLightbox
          open={!!lightboxFile}
          onOpenChange={(open) => {
            if (!open) setLightboxFile(null);
          }}
          fileId={lightboxFile.id}
        />
      )}
    </div>
  );
};

export { AssetPickerGrid };
