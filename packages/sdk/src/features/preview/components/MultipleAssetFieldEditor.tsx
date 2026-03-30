import { Button } from "@camox/ui/button";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { FileIcon, GripVertical } from "lucide-react";
import * as React from "react";

import { UploadDropZone } from "@/features/content/components/UploadDropZone";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useApiClient } from "@/lib/api-client";
import { type File, projectQueries } from "@/lib/queries";
import { cn } from "@/lib/utils";

import { AssetActionButtons } from "./AssetFieldEditor";
import { AssetLightbox } from "./AssetLightbox";
import { AssetPickerGrid } from "./AssetPickerGrid";
import { UnlinkAssetButton } from "./UnlinkAssetButton";

/* -------------------------------------------------------------------------------------------------
 * SortableAssetItem
 * -----------------------------------------------------------------------------------------------*/

type RepeatableItem = {
  _id: string;
  summary: string;
  position: string;
  content: Record<string, unknown>;
};

interface SortableAssetItemProps {
  item: RepeatableItem;
  assetType: "Image" | "File";
  contentKey: "image" | "file";
  onRemove: (itemId: string) => void;
  onAssetOpen: (item: RepeatableItem) => void;
}

const SortableAssetItem = ({
  item,
  assetType,
  contentKey,
  onRemove,
  onAssetOpen,
}: SortableAssetItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const asset = item.content?.[contentKey] as
    | { url: string; alt: string; filename: string; _fileId?: string }
    | undefined;

  const url = asset?.url ?? "";
  const alt = asset?.alt ?? "";
  const filename = asset?.filename ?? "Untitled";

  return (
    <li>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "flex flex-row items-center gap-2 px-1 py-1 max-w-full rounded-lg text-foreground transition-none group",
          !isDragging && "hover:bg-accent/75",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground flex shrink-0 cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </Button>

        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-zoom-in items-center gap-2"
          onClick={() => onAssetOpen(item)}
        >
          {assetType === "Image" ? (
            <div className="border-border h-12 w-12 shrink-0 overflow-hidden rounded border">
              <img src={url} alt={alt || filename} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="border-border bg-muted flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border">
              <FileIcon className="text-muted-foreground h-6 w-6" />
            </div>
          )}

          <p className="flex-1 truncate text-left text-sm" title={filename}>
            {filename}
          </p>
        </button>

        <UnlinkAssetButton
          fileId={asset?._fileId != null ? Number(asset._fileId) : undefined}
          onUnlink={() => onRemove(item._id)}
          className="hidden group-focus-within:flex group-hover:flex"
        />
      </div>
    </li>
  );
};

/* -------------------------------------------------------------------------------------------------
 * MultipleAssetFieldEditor
 * -----------------------------------------------------------------------------------------------*/

interface MultipleAssetFieldEditorProps {
  fieldName: string;
  assetType: "Image" | "File";
  currentData: Record<string, unknown>;
  blockId: string;
}

const MultipleAssetFieldEditor = ({
  fieldName,
  assetType,
  currentData,
  blockId,
}: MultipleAssetFieldEditorProps) => {
  const contentKey = assetType === "Image" ? "image" : "file";
  const isImage = assetType === "Image";
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const apiClient = useApiClient();
  const { data: project } = useQuery(projectQueries.getFirst(apiClient));

  const { uploads, uploadFiles } = useFileUpload({
    projectId: project?.id,
    onFileCommitted: (result) => {
      apiClient.repeatableItems.create.$post({
        json: {
          blockId: Number(blockId),
          fieldName,
          content: {
            [contentKey]: {
              url: result.url,
              alt: "",
              filename: result.filename,
              mimeType: result.mimeType,
              _fileId: result.fileId,
            },
          },
        },
      });
    },
  });

  const items = ((currentData[fieldName] ?? []) as RepeatableItem[]).filter((item) => {
    const asset = item.content?.[contentKey] as { url?: string } | undefined;
    return !!asset?.url;
  });

  // Picker & lightbox state
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [lightboxItem, setLightboxItem] = React.useState<RepeatableItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const dbItems = items;
    const oldIndex = dbItems.findIndex((item) => item._id === active.id);
    const newIndex = dbItems.findIndex((item) => item._id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    let afterPosition: string | undefined;
    let beforePosition: string | undefined;

    if (oldIndex < newIndex) {
      afterPosition = dbItems[newIndex].position;
      beforePosition = newIndex < dbItems.length - 1 ? dbItems[newIndex + 1].position : undefined;
    } else {
      afterPosition = newIndex > 0 ? dbItems[newIndex - 1].position : undefined;
      beforePosition = dbItems[newIndex].position;
    }

    await apiClient.repeatableItems.updatePosition.$post({
      json: { id: Number(active.id), afterPosition, beforePosition },
    });
  };

  const handleRemove = (itemId: string) => {
    apiClient.repeatableItems.delete.$post({ json: { id: Number(itemId) } });
  };

  const handleAssetOpen = (item: RepeatableItem) => {
    setLightboxItem(item);
  };

  const handleSelectMultiple = async (files: File[]) => {
    for (const file of files) {
      await apiClient.repeatableItems.create.$post({
        json: {
          blockId: Number(blockId),
          fieldName,
          content: {
            [contentKey]: {
              url: file.url,
              alt: file.alt,
              filename: file.filename,
              mimeType: file.mimeType,
              _fileId: file.id,
            },
          },
        },
      });
    }
    setPickerOpen(false);
  };

  return (
    <UploadDropZone onDrop={uploadFiles}>
      {pickerOpen ? (
        <AssetPickerGrid
          assetType={assetType}
          mode="multiple"
          onSelectSingle={() => {}}
          onSelectMultiple={handleSelectMultiple}
          onClose={() => setPickerOpen(false)}
        />
      ) : (
        <div className="space-y-4 px-4 py-4">
          {items.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={items.map((item) => item._id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-1">
                  {items.map((item) => (
                    <SortableAssetItem
                      key={item._id}
                      item={item}
                      assetType={assetType}
                      contentKey={contentKey}
                      onRemove={handleRemove}
                      onAssetOpen={handleAssetOpen}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
          <AssetActionButtons
            isImage={isImage}
            multiple={true}
            fileInputRef={fileInputRef}
            onPickerOpen={() => setPickerOpen(true)}
            onFilesSelected={uploadFiles}
            uploads={uploads}
          />
        </div>
      )}

      {(() => {
        const asset = lightboxItem?.content?.[contentKey] as { _fileId?: string } | undefined;
        if (!asset?._fileId) return null;
        return (
          <AssetLightbox
            open={!!lightboxItem}
            onOpenChange={(open) => {
              if (!open) setLightboxItem(null);
            }}
            fileId={Number(asset._fileId)}
          />
        );
      })()}
    </UploadDropZone>
  );
};

export { MultipleAssetFieldEditor };
