import { FileIcon } from "lucide-react";

import type { File } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface AssetCardProps {
  file: File;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

export const AssetCard = ({ file, selected, onSelect, onOpen }: AssetCardProps) => {
  const isImage = file.mimeType?.startsWith("image/");
  const extension = file.filename?.split(".").pop()?.toUpperCase() ?? "";

  return (
    <button
      type="button"
      data-asset-id={file.id}
      className={cn(
        "group flex flex-col gap-1.5 rounded-lg p-2 text-left border-2 border-transparent",
        selected ? "bg-primary/20 border-2 border-primary" : "hover:bg-accent/75",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <div className="bg-muted flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded-sm">
        {isImage ? (
          <img
            src={file.url}
            alt={file.alt || file.filename}
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-1">
            <FileIcon className="h-8 w-8" />
            {extension && <span className="text-sm font-medium">{extension}</span>}
          </div>
        )}
      </div>
      <p className="line-clamp-2 px-0.5 text-xs break-all">{file.filename}</p>
    </button>
  );
};
