import { FileIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Doc } from "camox/_generated/dataModel";

interface AssetCardProps {
  file: Doc<"files">;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

export const AssetCard = ({
  file,
  selected,
  onSelect,
  onOpen,
}: AssetCardProps) => {
  const isImage = file.mimeType?.startsWith("image/");
  const extension = file.filename?.split(".").pop()?.toUpperCase() ?? "";

  return (
    <button
      type="button"
      className={cn(
        "group flex flex-col gap-1.5 rounded-lg p-2 text-left transition-colors",
        selected
          ? "bg-accent"
          : "hover:bg-accent/50",
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
      <div className="aspect-4/3 w-full overflow-hidden rounded-md bg-muted/30 flex items-center justify-center">
        {isImage ? (
          <img
            src={file.url}
            alt={file.alt || file.filename}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <FileIcon className="h-8 w-8" />
            {extension && (
              <span className="text-xs font-medium">{extension}</span>
            )}
          </div>
        )}
      </div>
      <p className="text-xs line-clamp-2 break-all px-0.5">{file.filename}</p>
    </button>
  );
};
