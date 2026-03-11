import type { Doc } from "camox/_generated/dataModel";
import { CheckIcon, FileIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface AssetCardProps {
  file: Doc<"files">;
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
      data-asset-id={file._id}
      className={cn(
        "group flex flex-col gap-1.5 rounded-lg p-2 text-left",
        selected ? "bg-accent" : "hover:bg-accent/50",
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
      <div className="bg-muted/30 relative flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded-md">
        {selected && (
          <div className="bg-primary text-primary-foreground absolute top-1.5 left-1.5 z-10 flex h-5 w-5 items-center justify-center rounded shadow-sm">
            <CheckIcon className="h-3.5 w-3.5" />
          </div>
        )}
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
            {extension && <span className="text-xs font-medium">{extension}</span>}
          </div>
        )}
      </div>
      <p className="line-clamp-2 px-0.5 text-xs break-all">{file.filename}</p>
    </button>
  );
};
