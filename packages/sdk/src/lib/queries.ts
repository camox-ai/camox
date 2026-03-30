import { type ApiClient, getOrpc } from "./api-client";

// --- Inferred API response types ---

export type Page = Awaited<ReturnType<ApiClient["pages"]["list"]>>[number];
export type PageWithBlocks = Awaited<ReturnType<ApiClient["pages"]["getByPath"]>>;
export type File = Awaited<ReturnType<ApiClient["files"]["list"]>>[number];
export type Project = Awaited<ReturnType<ApiClient["projects"]["getFirst"]>>;
export type Layout = Awaited<ReturnType<ApiClient["layouts"]["list"]>>[number];
export type BlockUsageCounts = Awaited<ReturnType<ApiClient["blocks"]["getUsageCounts"]>>;

// --- Query factories ---

export const pageQueries = {
  list: () => getOrpc().pages.list.queryOptions({ staleTime: Infinity }),

  getByPath: (fullPath: string) =>
    getOrpc().pages.getByPath.queryOptions({
      input: { path: fullPath },
      staleTime: Infinity,
    }),

  getById: (id: number) =>
    getOrpc().pages.get.queryOptions({
      input: { id },
      staleTime: Infinity,
    }),
};

export const fileQueries = {
  list: () => getOrpc().files.list.queryOptions({ staleTime: Infinity }),

  get: (id: number) =>
    getOrpc().files.get.queryOptions({
      input: { id },
      staleTime: Infinity,
    }),

  getUsageCount: (id: number) => ({
    ...getOrpc().files.getUsageCount.queryOptions({
      input: { id },
      staleTime: Infinity,
    }),
    select: (data: { count: number }) => data.count,
  }),
};

export const projectQueries = {
  getFirst: () => getOrpc().projects.getFirst.queryOptions({ staleTime: Infinity }),
};

export const layoutQueries = {
  list: (projectId: number) =>
    getOrpc().layouts.list.queryOptions({
      input: { projectId },
      staleTime: Infinity,
    }),
};

export const blockQueries = {
  getUsageCounts: () => ({
    ...getOrpc().blocks.getUsageCounts.queryOptions({
      staleTime: Infinity,
    }),
    select: (data: BlockUsageCounts) => {
      const counts: Record<string, number> = {};
      for (const { type, count } of data) {
        counts[type] = count;
      }
      return counts;
    },
  }),

  getPageMarkdown: (pageId: number) => ({
    ...getOrpc().blocks.getPageMarkdown.queryOptions({
      input: { pageId },
      staleTime: Infinity,
    }),
    select: (data: { markdown: string }) => data.markdown,
  }),
};
