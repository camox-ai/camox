"use client";

import { useCallback, useRef, useState } from "react";

import { trackClientEvent } from "@/lib/analytics-client";
import { useApiClient } from "@/lib/api-client";

export interface UploadItem {
  id: string;
  filename: string;
  progress: number;
  status: "uploading" | "complete" | "error";
  error?: string;
}

interface UseFileUploadOptions {
  projectId?: number;
  onFileCommitted?: (result: {
    fileId: string;
    url: string;
    filename: string;
    mimeType: string;
  }) => void;
}

export function useFileUpload(options?: UseFileUploadOptions) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const apiClient = useApiClient();
  const nextId = useRef(0);
  const projectIdRef = useRef(options?.projectId);
  projectIdRef.current = options?.projectId;
  const onFileCommittedRef = useRef(options?.onFileCommitted);
  onFileCommittedRef.current = options?.onFileCommitted;

  const uploadSingleFile = useCallback(
    async (file: File, itemId: string) => {
      // Upload via XHR for progress tracking
      const result = await new Promise<{
        id: number;
        url: string;
        filename: string;
        mimeType: string;
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (event) => {
          if (!event.lengthComputable) return;
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploads((prev) => prev.map((u) => (u.id === itemId ? { ...u, progress } : u)));
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
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

        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectId", String(projectIdRef.current ?? 0));

        const uploadUrl = apiClient.files.upload.$url().toString();
        xhr.open("POST", uploadUrl);
        xhr.withCredentials = true;
        xhr.send(formData);
      });

      onFileCommittedRef.current?.({
        fileId: String(result.id),
        url: result.url,
        filename: result.filename,
        mimeType: result.mimeType,
      });
      trackClientEvent("file_uploaded", { mimeType: file.type });

      setUploads((prev) =>
        prev.map((u) =>
          u.id === itemId ? { ...u, status: "complete" as const, progress: 100 } : u,
        ),
      );

      // Auto-remove after 2s
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.id !== itemId));
      }, 2000);
    },
    [apiClient],
  );

  const uploadFiles = useCallback(
    (files: FileList) => {
      const newItems: UploadItem[] = Array.from(files).map((file) => ({
        id: String(nextId.current++),
        filename: file.name,
        progress: 0,
        status: "uploading" as const,
      }));

      setUploads((prev) => [...prev, ...newItems]);

      // Upload all in parallel
      Promise.all(
        Array.from(files).map((file, i) =>
          uploadSingleFile(file, newItems[i].id).catch((err) => {
            const message = err instanceof Error ? err.message : "Upload failed";
            setUploads((prev) =>
              prev.map((u) =>
                u.id === newItems[i].id ? { ...u, status: "error" as const, error: message } : u,
              ),
            );
          }),
        ),
      );
    },
    [uploadSingleFile],
  );

  const clearAll = useCallback(() => {
    setUploads([]);
  }, []);

  return { uploads, uploadFiles, clearAll };
}
