"use client";

import { api } from "camox/_generated/api";
import { useMutation } from "convex/react";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FS_PREFIX, getSiteUrl } from "@/lib/convex-site";

export interface FileRef {
  _fileId: string;
}

interface ImageValue {
  url: string;
  alt: string;
  filename: string;
  mimeType: string;
  _fileId?: string;
}

interface FileUploadProps {
  initialValue?: ImageValue;
  multiple?: boolean;
  hidePreview?: boolean;
  accept?: string;
  label?: string;
  onUploadComplete: (ref: FileRef) => void;
  onClear?: () => void;
}

export function FileUpload({
  initialValue,
  multiple,
  hidePreview,
  accept = "image/*",
  label,
  onUploadComplete,
  onClear,
}: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const commitFile = useMutation(api.files.commitFile);
  const siteUrl = getSiteUrl();

  const uploadSingleFile = useCallback(
    async (file: File): Promise<FileRef> => {
      // 1. Upload blob to ConvexFS endpoint with progress tracking
      const blobId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100));
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

        xhr.addEventListener("error", () => {
          reject(new Error("Upload failed"));
        });

        xhr.open("POST", `${siteUrl}${FS_PREFIX}/upload`);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      // 2. Commit the file — creates a record in the files table
      const { fileId } = await commitFile({
        blobId,
        filename: file.name,
        contentType: file.type,
        siteUrl,
      });

      return { _fileId: fileId };
    },
    [siteUrl, commitFile],
  );

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setUploading(true);
      setProgress(0);
      setError(null);

      try {
        if (multiple) {
          for (const file of Array.from(files)) {
            const ref = await uploadSingleFile(file);
            onUploadComplete(ref);
          }
        } else {
          const ref = await uploadSingleFile(files[0]);
          onUploadComplete(ref);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    [multiple, uploadSingleFile, onUploadComplete],
  );

  const handleBoxClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  };

  const hasImage = !!initialValue?.url;

  const isImageOnly = accept === "image/*";
  let uploadLabel: string;
  if (multiple) {
    uploadLabel = isImageOnly ? "Upload images" : "Upload files";
  } else if (hasImage) {
    uploadLabel = isImageOnly ? "Use another image" : "Use another file";
  } else {
    uploadLabel = isImageOnly ? "Upload an image" : "Upload a file";
  }

  return (
    <div className="space-y-4">
      {hasImage && !hidePreview && (
        <div className="space-y-2">
          <div className="border-border relative overflow-hidden rounded-md border">
            <img
              src={initialValue.url}
              alt={initialValue.alt || initialValue.filename}
              className="h-auto max-h-48 w-full object-cover"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <ImageIcon className="text-muted-foreground h-4 w-4 shrink-0" />
              <span className="text-muted-foreground truncate text-sm">
                {initialValue.filename}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="bg-transparent! hover:text-red-500"
              onClick={() => onClear?.()}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div
        className="border-border flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-8 text-center"
        onClick={handleBoxClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="bg-muted mb-2 rounded-full p-3">
          <Upload className="text-muted-foreground h-5 w-5" />
        </div>
        <p className="text-foreground text-sm text-pretty">{label ?? uploadLabel}</p>
        <input
          type="file"
          id="fileUpload"
          ref={fileInputRef}
          className="hidden"
          accept={accept}
          multiple={multiple}
          disabled={uploading}
          onChange={(e) => {
            handleFileSelect(e.target.files);
            e.target.value = "";
          }}
        />

        {uploading && (
          <div className="mt-4 w-full space-y-1">
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div className="bg-primary h-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-muted-foreground text-xs">{progress}%</p>
          </div>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
