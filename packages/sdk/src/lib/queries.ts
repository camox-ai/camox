import { queryKeys } from "@camox/api/query-keys";

import { type ApiClient, getOrpc } from "./api-client";

// --- Inferred API response types ---

export type Page = Awaited<ReturnType<ApiClient["pages"]["list"]>>[number];
export type PageWithBlocks = Awaited<ReturnType<ApiClient["pages"]["getByPath"]>>;
export type BlockBundle = Awaited<ReturnType<ApiClient["blocks"]["get"]>>;
export type File = Awaited<ReturnType<ApiClient["files"]["list"]>>[number];

/** Slim structural data stored in the page query cache (no blocks/items/files). */
export type PageStructure = {
  page: PageWithBlocks["page"];
  layout: PageWithBlocks["layout"];
  projectName: string;
};
export type Project = Awaited<ReturnType<ApiClient["projects"]["getBySlug"]>>;
export type Layout = Awaited<ReturnType<ApiClient["layouts"]["list"]>>[number];
export type BlockUsageCounts = Awaited<ReturnType<ApiClient["blocks"]["getUsageCounts"]>>;

// --- Query factories ---

export const pageQueries = {
  list: () => ({
    ...getOrpc().pages.list.queryOptions({ staleTime: Infinity }),
    queryKey: queryKeys.pages.list,
  }),

  getByPath: (fullPath: string) => ({
    ...getOrpc().pages.getByPath.queryOptions({
      input: { path: fullPath },
      staleTime: Infinity,
    }),
    queryKey: queryKeys.pages.getByPath(fullPath),
  }),

  getById: (id: number) => ({
    ...getOrpc().pages.get.queryOptions({
      input: { id },
      staleTime: Infinity,
    }),
    queryKey: queryKeys.pages.getById(id),
  }),
};

export const fileQueries = {
  list: () => ({
    ...getOrpc().files.list.queryOptions({ staleTime: Infinity }),
    queryKey: queryKeys.files.list,
  }),

  get: (id: number) => ({
    ...getOrpc().files.get.queryOptions({
      input: { id },
      staleTime: Infinity,
    }),
    queryKey: queryKeys.files.get(id),
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
  getBySlug: (slug: string) => ({
    ...getOrpc().projects.getBySlug.queryOptions({
      input: { slug },
      staleTime: Infinity,
    }),
  }),
};

export const layoutQueries = {
  list: (projectId: number) => ({
    ...getOrpc().layouts.list.queryOptions({
      input: { projectId },
      staleTime: Infinity,
    }),
    queryKey: queryKeys.layouts.all,
  }),
};

export const blockQueries = {
  get: (id: number) => ({
    ...getOrpc().blocks.get.queryOptions({
      input: { id },
      staleTime: Infinity,
    }),
    queryKey: queryKeys.blocks.get(id),
  }),

  getUsageCounts: () => ({
    ...getOrpc().blocks.getUsageCounts.queryOptions({
      staleTime: Infinity,
    }),
    queryKey: queryKeys.blocks.getUsageCounts,
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
    queryKey: queryKeys.blocks.getPageMarkdown(pageId),
    select: (data: { markdown: string }) => data.markdown,
  }),
};

export const repeatableItemQueries = {
  get: (id: number) => ({
    ...getOrpc().repeatableItems.get.queryOptions({
      input: { id },
      staleTime: Infinity,
    }),
    queryKey: queryKeys.repeatableItems.get(id),
  }),
};

export const blockMutations = {
  create: () => getOrpc().blocks.create.mutationOptions(),
  delete: () => getOrpc().blocks.delete.mutationOptions(),
  deleteMany: () => getOrpc().blocks.deleteMany.mutationOptions(),
  duplicate: () => getOrpc().blocks.duplicate.mutationOptions(),
  updateContent: () => getOrpc().blocks.updateContent.mutationOptions(),
  updateSettings: () => getOrpc().blocks.updateSettings.mutationOptions(),
  updatePosition: () => getOrpc().blocks.updatePosition.mutationOptions(),
};

export const repeatableItemMutations = {
  create: () => getOrpc().repeatableItems.create.mutationOptions(),
  delete: () => getOrpc().repeatableItems.delete.mutationOptions(),
  duplicate: () => getOrpc().repeatableItems.duplicate.mutationOptions(),
  updateContent: () => getOrpc().repeatableItems.updateContent.mutationOptions(),
  updatePosition: () => getOrpc().repeatableItems.updatePosition.mutationOptions(),
};

export const pageMutations = {
  create: () => getOrpc().pages.create.mutationOptions(),
  delete: () => getOrpc().pages.delete.mutationOptions(),
  update: () => getOrpc().pages.update.mutationOptions(),
  setLayout: () => getOrpc().pages.setLayout.mutationOptions(),
  setAiSeo: () => getOrpc().pages.setAiSeo.mutationOptions(),
  setMetaTitle: () => getOrpc().pages.setMetaTitle.mutationOptions(),
  setMetaDescription: () => getOrpc().pages.setMetaDescription.mutationOptions(),
};

export const fileMutations = {
  delete: () => getOrpc().files.delete.mutationOptions(),
  deleteMany: () => getOrpc().files.deleteMany.mutationOptions(),
  replace: () => getOrpc().files.replace.mutationOptions(),
  setAiMetadata: () => getOrpc().files.setAiMetadata.mutationOptions(),
  setFilename: () => getOrpc().files.setFilename.mutationOptions(),
  setAlt: () => getOrpc().files.setAlt.mutationOptions(),
};
