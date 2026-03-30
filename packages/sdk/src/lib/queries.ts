import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import type { ApiClient } from "./api-client";

// --- Inferred API response types ---

export type Page = InferResponseType<typeof _api.pages.list.$get, 200>[number];
export type PageWithBlocks = InferResponseType<typeof _api.pages.getByPath.$get, 200>;
export type File = InferResponseType<typeof _api.files.list.$get, 200>[number];
export type Project = InferResponseType<typeof _api.projects.getFirst.$get, 200>;
export type Layout = InferResponseType<typeof _api.layouts.list.$get, 200>[number];
export type BlockUsageCounts = InferResponseType<typeof _api.blocks.getUsageCounts.$get, 200>;

// Dummy client reference for type inference only (never called)
declare const _api: ApiClient;

// --- Query factories ---

export const pageQueries = {
  list: (api: ApiClient) =>
    queryOptions({
      queryKey: ["pages", "list"],
      queryFn: async () => {
        const res = await api.pages.list.$get();
        if (!res.ok) throw new Error("Failed to fetch pages");
        return res.json();
      },
      staleTime: Infinity,
    }),

  getByPath: (api: ApiClient, fullPath: string) =>
    queryOptions({
      queryKey: ["pages", "getByPath", fullPath],
      queryFn: async (): Promise<PageWithBlocks> => {
        const res = await api.pages.getByPath.$get({ query: { path: fullPath } });
        if (!res.ok) throw new Error("Failed to fetch page");
        return res.json() as Promise<PageWithBlocks>;
      },
      staleTime: Infinity,
    }),

  getById: (api: ApiClient, id: number) =>
    queryOptions({
      queryKey: ["pages", "get", id],
      queryFn: async () => {
        const res = await api.pages.get.$get({ query: { id: id.toString() } });
        if (!res.ok) throw new Error("Failed to fetch page");
        return res.json();
      },
      staleTime: Infinity,
    }),
};

export const fileQueries = {
  list: (api: ApiClient) =>
    queryOptions({
      queryKey: ["files", "list"],
      queryFn: async () => {
        const res = await api.files.list.$get();
        if (!res.ok) throw new Error("Failed to fetch files");
        return res.json();
      },
      staleTime: Infinity,
    }),

  get: (api: ApiClient, id: number) =>
    queryOptions({
      queryKey: ["files", "get", id],
      queryFn: async () => {
        const res = await api.files.get.$get({ query: { id: id.toString() } });
        if (!res.ok) throw new Error("Failed to fetch file");
        return res.json();
      },
      staleTime: Infinity,
    }),

  getUsageCount: (api: ApiClient, id: number) =>
    queryOptions({
      queryKey: ["files", "getUsageCount", id],
      queryFn: async () => {
        const res = await api.files.getUsageCount.$get({ query: { id: id.toString() } });
        if (!res.ok) throw new Error("Failed to fetch file usage count");
        const data = await res.json();
        return data.count;
      },
      staleTime: Infinity,
    }),
};

export const projectQueries = {
  getFirst: (api: ApiClient) =>
    queryOptions({
      queryKey: ["projects", "getFirst"],
      queryFn: async () => {
        const res = await api.projects.getFirst.$get();
        if (!res.ok) throw new Error("Failed to fetch project");
        return res.json();
      },
      staleTime: Infinity,
    }),
};

export const layoutQueries = {
  list: (api: ApiClient, projectId: number) =>
    queryOptions({
      queryKey: ["layouts", "list", projectId],
      queryFn: async () => {
        const res = await api.layouts.list.$get({
          query: { projectId: projectId.toString() },
        });
        if (!res.ok) throw new Error("Failed to fetch layouts");
        return res.json();
      },
      staleTime: Infinity,
    }),
};

export const blockQueries = {
  getUsageCounts: (api: ApiClient) =>
    queryOptions({
      queryKey: ["blocks", "getUsageCounts"],
      queryFn: async () => {
        const res = await api.blocks.getUsageCounts.$get();
        if (!res.ok) throw new Error("Failed to fetch block usage counts");
        const data = await res.json();
        const counts: Record<string, number> = {};
        for (const { type, count } of data) {
          counts[type] = count;
        }
        return counts;
      },
      staleTime: Infinity,
    }),

  getPageMarkdown: (api: ApiClient, pageId: number) =>
    queryOptions({
      queryKey: ["blocks", "getPageMarkdown", pageId],
      queryFn: async () => {
        const res = await api.blocks.getPageMarkdown.$get({
          query: { pageId: pageId.toString() },
        });
        if (!res.ok) throw new Error("Failed to fetch page markdown");
        const data = await res.json();
        return data.markdown;
      },
      staleTime: Infinity,
    }),
};
