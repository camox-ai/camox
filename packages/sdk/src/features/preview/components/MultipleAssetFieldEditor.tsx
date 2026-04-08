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
import { useProjectSlug } from "@/lib/auth";
import { type File, projectQueries } from "@/lib/queries";
import { cn } from "@/lib/utils";

import { AssetActionButtons } from "./AssetFieldEditor";
import { AssetLightbox } from "./AssetLightbox";
import { AssetPickerGrid } from "./AssetPickerGrid";
import { UnlinkAssetButton } from "./UnlinkAssetButton";

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

type ResolvedAsset = {
  url: string;
  alt: string;
  filename: string;
  mimeType: string;
  _fileId: number;
};

/* -------------------------------------------------------------------------------------------------
 * SortableAssetItem
 * -----------------------------------------------------------------------------------------------*/

interface SortableAssetItemProps {
  asset: ResolvedAsset;
  assetType: "Image" | "File";
  onRemove: (fileId: number) => void;
  onAssetOpen: (asset: ResolvedAsset) => void;
}

const SortableAssetItem = ({ asset, assetType, onRemove, onAssetOpen }: SortableAssetItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(asset._fileId),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

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
          onClick={() => onAssetOpen(asset)}
        >
          {assetType === "Image" ? (
            <div className="border-border h-12 w-12 shrink-0 overflow-hidden rounded border">
              <img
                src={asset.url}
                alt={asset.alt || asset.filename}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="border-border bg-muted flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border">
              <FileIcon className="text-muted-foreground h-6 w-6" />
            </div>
          )}

          <p className="flex-1 truncate text-left text-sm" title={asset.filename}>
            {asset.filename || "Untitled"}
          </p>
        </button>

        <UnlinkAssetButton
          fileId={asset._fileId}
          onUnlink={() => onRemove(asset._fileId)}
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
  onFieldChange: (fieldName: string, value: unknown) => void;
}

const MultipleAssetFieldEditor = ({
  fieldName,
  assetType,
  currentData,
  onFieldChange,
}: MultipleAssetFieldEditorProps) => {
  const contentKey = assetType === "Image" ? "image" : "file";
  const isImage = assetType === "Image";
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const projectSlug = useProjectSlug();
  const { data: project } = useQuery(projectQueries.getBySlug(projectSlug));

  // Resolved array: [{ image: { url, alt, ..., _fileId } }, ...] or [{ file: { ... } }, ...]
  const rawItems = (currentData[fieldName] ?? []) as Record<string, ResolvedAsset>[];
  const items = rawItems
    .map((item) => item[contentKey])
    .filter((a): a is ResolvedAsset => !!a?.url);

  // Write { contentKey: { _fileId } } wrappers — the read path resolves _fileId markers
  const toStorageFormat = (assets: ResolvedAsset[]) =>
    assets.map((a) => ({ [contentKey]: { _fileId: a._fileId } }));

  const addFileId = (fileId: number) => {
    onFieldChange(fieldName, [...toStorageFormat(items), { [contentKey]: { _fileId: fileId } }]);
  };

  const { uploads, uploadFiles } = useFileUpload({
    projectId: project?.id,
    onFileCommitted: (result) => {
      addFileId(Number(result.fileId));
    },
  });

  // Picker & lightbox state
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [lightboxAsset, setLightboxAsset] = React.useState<ResolvedAsset | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((a) => String(a._fileId) === active.id);
    const newIndex = items.findIndex((a) => String(a._fileId) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...items];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    onFieldChange(fieldName, toStorageFormat(reordered));
  };

  const handleRemove = (fileId: number) => {
    onFieldChange(fieldName, toStorageFormat(items.filter((a) => a._fileId !== fileId)));
  };

  const handleSelectMultiple = (files: File[]) => {
    onFieldChange(fieldName, [
      ...toStorageFormat(items),
      ...files.map((f) => ({ [contentKey]: { _fileId: f.id } })),
    ]);
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
                items={items.map((a) => String(a._fileId))}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-1">
                  {items.map((asset) => (
                    <SortableAssetItem
                      key={asset._fileId}
                      asset={asset}
                      assetType={assetType}
                      onRemove={handleRemove}
                      onAssetOpen={setLightboxAsset}
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

      {lightboxAsset && (
        <AssetLightbox
          open={!!lightboxAsset}
          onOpenChange={(open) => {
            if (!open) setLightboxAsset(null);
          }}
          fileId={lightboxAsset._fileId}
        />
      )}
    </UploadDropZone>
  );
};

export { MultipleAssetFieldEditor };
