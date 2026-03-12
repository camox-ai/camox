import type { Doc, Id } from "camox/_generated/dataModel";
import { FileIcon, X } from "lucide-react";
import * as React from "react";

import { FileUpload } from "@/components/file-upload";
import { Button } from "@/components/ui/button";

import { AssetLightbox } from "./AssetLightbox";
import { AssetPickerGrid } from "./AssetPickerGrid";

/* -------------------------------------------------------------------------------------------------
 * SingleAssetFieldEditor
 * -----------------------------------------------------------------------------------------------*/

const SingleAssetFieldEditor = ({
  fieldName,
  assetType,
  currentData,
  onFieldChange,
}: {
  fieldName: string;
  assetType: "Image" | "File";
  currentData: Record<string, unknown>;
  onFieldChange: (fieldName: string, value: unknown) => void;
}) => {
  const asset = currentData[fieldName] as
    | {
        url: string;
        alt: string;
        filename: string;
        mimeType: string;
        _fileId?: string;
      }
    | undefined;

  const hasAsset = !!asset?.url;
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const isImage = assetType === "Image";

  const handleSelectExisting = (file: Doc<"files">) => {
    onFieldChange(fieldName, {
      url: file.url,
      alt: file.alt,
      filename: file.filename,
      mimeType: file.mimeType,
      _fileId: file._id,
    });
    setPickerOpen(false);
  };

  if (pickerOpen) {
    return (
      <AssetPickerGrid
        assetType={assetType}
        mode="single"
        onSelectSingle={handleSelectExisting}
        onSelectMultiple={() => {}}
        onClose={() => setPickerOpen(false)}
      />
    );
  }

  return (
    <div className="space-y-4 px-4 py-4">
      {hasAsset && (
        <div className="text-foreground hover:bg-accent/75 flex max-w-full flex-row items-center gap-2 rounded-lg border-2 px-1 py-1">
          <button
            type="button"
            className="flex min-w-0 flex-1 cursor-zoom-in items-center gap-2"
            onClick={() => setLightboxOpen(true)}
          >
            {isImage ? (
              <div className="border-border h-10 w-10 shrink-0 overflow-hidden rounded border">
                <img
                  src={asset.url}
                  alt={asset.alt || asset.filename}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="border-border bg-muted flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border">
                <FileIcon className="text-muted-foreground h-5 w-5" />
              </div>
            )}

            <p className="flex-1 truncate text-left text-sm" title={asset.filename}>
              {asset.filename || "Untitled"}
            </p>
          </button>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => {
              onFieldChange(fieldName, {
                url: "",
                alt: "",
                filename: "",
                mimeType: "",
              });
            }}
          >
            <X className="h-4 w-4" />
          </Button>

          {asset._fileId && (
            <AssetLightbox
              open={lightboxOpen}
              onOpenChange={setLightboxOpen}
              fileId={asset._fileId as Id<"files">}
            />
          )}
        </div>
      )}

      <Button variant="default" className="mx-auto block" onClick={() => setPickerOpen(true)}>
        Select existing {isImage ? "image" : "file"}
      </Button>

      <FileUpload
        initialValue={asset}
        hidePreview
        accept={isImage ? "image/*" : "*/*"}
        onUploadComplete={(ref) => {
          onFieldChange(fieldName, ref);
        }}
        onClear={() => {
          onFieldChange(fieldName, {
            url: "",
            alt: "",
            filename: "",
            mimeType: "",
          });
        }}
      />
    </div>
  );
};

export { SingleAssetFieldEditor };
