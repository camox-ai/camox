import {
  Check,
  Download,
  FileIcon,
  Link,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FS_PREFIX, getSiteUrl } from "@/lib/convex-site";
import { UploadDropZone } from "@/features/content/components/UploadDropZone";
import { api } from "camox/_generated/api";
import type { Id } from "camox/_generated/dataModel";
import { DebouncedFieldEditor } from "./DebouncedFieldEditor";

interface AssetLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: Id<"files">;
}

const AssetLightbox = ({ open, onOpenChange, fileId }: AssetLightboxProps) => {
  const file = useQuery(api.files.getFile, { fileId });
  const [zoomed, setZoomed] = useState(false);
  const [uploadState, setUploadState] = useState<{
    status: "uploading" | "committing" | "complete" | "error";
    progress: number;
    filename: string;
    error?: string;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomedWidth, setZoomedWidth] = useState<number | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const updateFileFilename = useMutation(api.files.updateFileFilename);
  const updateFileAlt = useMutation(api.files.updateFileAlt);
  const deleteFile = useMutation(api.files.deleteFile);
  const replaceFile = useMutation(api.files.replaceFile);
  const setAiMetadata = useMutation(api.files.setAiMetadata);
  const commitFile = useMutation(api.files.commitFile);
  const siteUrl = getSiteUrl();

  const handleReplaceDrop = useCallback(
    async (files: FileList) => {
      const droppedFile = files[0];
      if (!droppedFile) return;

      setUploadState({
        status: "uploading",
        progress: 0,
        filename: droppedFile.name,
      });

      try {
        const blobId = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              setUploadState((prev) =>
                prev
                  ? {
                      ...prev,
                      progress: Math.round((e.loaded / e.total) * 100),
                    }
                  : prev,
              );
            }
          });
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const response = JSON.parse(xhr.responseText);
                resolve(response.blobId);
              } catch {
                reject(new Error("Invalid response from upload"));
              }
            } else {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          });
          xhr.addEventListener("error", () =>
            reject(new Error("Upload failed")),
          );
          xhr.open("POST", `${siteUrl}${FS_PREFIX}/upload`);
          xhr.setRequestHeader("Content-Type", droppedFile.type);
          xhr.send(droppedFile);
        });

        setUploadState((prev) =>
          prev ? { ...prev, status: "committing", progress: 100 } : prev,
        );

        const { fileId: newFileId } = await commitFile({
          blobId,
          filename: droppedFile.name,
          contentType: droppedFile.type,
          siteUrl,
        });

        await replaceFile({
          oldFileId: fileId,
          newFileId: newFileId as Id<"files">,
        });

        setUploadState((prev) =>
          prev ? { ...prev, status: "complete" } : prev,
        );
        toast.success("File replaced");
        setTimeout(() => {
          setUploadState(null);
          onOpenChange(false);
        }, 600);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setUploadState((prev) =>
          prev ? { ...prev, status: "error", error: message } : prev,
        );
        toast.error(message);
        setTimeout(() => setUploadState(null), 3000);
      }
    },
    [siteUrl, commitFile, replaceFile, fileId, onOpenChange],
  );

  const handleCopyUrl = async () => {
    if (!file) return;
    await navigator.clipboard.writeText(file.url);
    toast("Link copied to clipboard");
  };

  const handleDownload = () => {
    if (!file) return;
    const a = document.createElement("a");
    a.href = file.url;
    a.download = file.filename || "file";
    a.click();
  };

  const handleDelete = async () => {
    await deleteFile({ fileId });
    onOpenChange(false);
  };

  if (!file) return null;

  const isImage = file.mimeType?.startsWith("image/");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setZoomed(false);
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="w-[90vw] h-[90vh] max-w-[90vw] max-h-[90vh] p-0 overflow-hidden sm:max-w-[90vw] gap-0"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">
          {file.alt || file.filename || "File preview"}
        </DialogTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-10"
          onClick={() => onOpenChange(false)}
        >
          <X />
        </Button>
        <div className="flex flex-row h-full">
          <UploadDropZone
            label="Drop file to replace"
            onDrop={handleReplaceDrop}
            className="flex-1 min-w-0"
          >
            {isImage ? (
              <div
                ref={containerRef}
                className={cn(
                  "checkered absolute inset-0",
                  zoomed
                    ? "overflow-auto"
                    : "overflow-hidden flex items-center justify-center p-6",
                )}
                onClick={() => {
                  if (!zoomed) return;
                  setZoomed(false);
                  setZoomedWidth(null);
                }}
              >
                <div
                  className={cn(
                    zoomed && "min-h-full flex items-center",
                  )}
                >
                  <img
                    src={file.url}
                    alt={file.alt || file.filename}
                    className={cn(
                      "shadow-lg",
                      zoomed
                        ? "max-w-none cursor-zoom-out"
                        : "max-w-full max-h-full object-contain cursor-zoom-in",
                    )}
                    style={
                      zoomed && zoomedWidth
                        ? { width: zoomedWidth }
                        : undefined
                    }
                    onClick={(e) => {
                      if (zoomed) return;
                      e.stopPropagation();
                      const img = e.currentTarget;
                      const rect = img.getBoundingClientRect();
                      const fracX = (e.clientX - rect.left) / rect.width;
                      const fracY = (e.clientY - rect.top) / rect.height;
                      const container = containerRef.current;
                      const minWidth = container
                        ? container.clientWidth * 2
                        : 0;
                      setZoomedWidth(
                        Math.max(img.naturalWidth, minWidth),
                      );
                      setZoomed(true);
                      requestAnimationFrame(() => {
                        const container = containerRef.current;
                        const zoomedImg = container?.querySelector("img");
                        if (!container || !zoomedImg) return;
                        container.scrollLeft =
                          fracX * zoomedImg.offsetWidth -
                          container.clientWidth / 2;
                        container.scrollTop =
                          fracY * zoomedImg.offsetHeight -
                          container.clientHeight / 2;
                      });
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[70vh] flex items-center justify-center p-6 bg-muted/30">
                <FileIcon className="h-16 w-16 text-muted-foreground" />
              </div>
            )}
            {uploadState && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                <div className="w-64 rounded-lg border border-border bg-background p-4 shadow-lg">
                  <div className="flex items-center gap-2">
                    <div className="shrink-0">
                      {uploadState.status === "uploading" && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      {uploadState.status === "committing" && (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                      {uploadState.status === "complete" && (
                        <Check className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {uploadState.status === "uploading" && "Uploading…"}
                        {uploadState.status === "committing" && "Processing…"}
                        {uploadState.status === "complete" && "Replaced"}
                        {uploadState.status === "error" && "Upload failed"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {uploadState.filename}
                      </p>
                    </div>
                  </div>
                  {(uploadState.status === "uploading" ||
                    uploadState.status === "committing") && (
                    <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-200"
                        style={{ width: `${uploadState.progress}%` }}
                      />
                    </div>
                  )}
                  {uploadState.status === "error" && uploadState.error && (
                    <p className="mt-2 text-xs text-destructive">
                      {uploadState.error}
                    </p>
                  )}
                </div>
              </div>
            )}
          </UploadDropZone>
          <div className="w-80 shrink-0 border-l border-border bg-background flex flex-col">
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <ButtonGroup>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleCopyUrl}
                    >
                      <Link />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy URL</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleDownload}
                    >
                      <Download />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleDelete}
                    >
                      <Trash2 />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </ButtonGroup>
              <div className="flex items-center gap-2">
                <Switch
                  id="ai-metadata"
                  checked={file.aiMetadataEnabled !== false}
                  onCheckedChange={(checked) =>
                    setAiMetadata({ fileId, enabled: checked })
                  }
                />
                <Label htmlFor="ai-metadata">AI metadata</Label>
              </div>
              <DebouncedFieldEditor
                label="File name"
                placeholder="File name..."
                initialValue={file.filename}
                disabled={file.aiMetadataEnabled !== false}
                onSave={(value) =>
                  updateFileFilename({ fileId, filename: value })
                }
              />
              <DebouncedFieldEditor
                label="Alt text"
                placeholder="Describe this file..."
                initialValue={file.alt}
                disabled={file.aiMetadataEnabled !== false}
                rows={2}
                onSave={(value) => updateFileAlt({ fileId, alt: value })}
              />
              <input
                ref={replaceInputRef}
                type="file"
                className="hidden"
                accept={isImage ? "image/*" : "*/*"}
                onChange={(e) => {
                  if (e.target.files) handleReplaceDrop(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => replaceInputRef.current?.click()}
              >
                {isImage ? "Replace image" : "Replace file"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { AssetLightbox };
