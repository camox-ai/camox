export const queryKeys = {
  pages: {
    list: ["pages", "list"] as const,
    getByPath: (path: string) => ["pages", "getByPath", path] as const,
    getByPathAll: ["pages", "getByPath"] as const,
    getById: (id: number) => ["pages", "getById", id] as const,
  },
  files: {
    list: ["files", "list"] as const,
    get: (id: number) => ["files", "get", id] as const,
  },
  blocks: {
    getUsageCounts: ["blocks", "getUsageCounts"] as const,
    getPageMarkdown: (pageId: number) => ["blocks", "getPageMarkdown", pageId] as const,
  },
  layouts: {
    all: ["layouts"] as const,
  },
};

export type QueryKey = ReadonlyArray<string | number>;

export type InvalidationMessage = {
  type: "invalidate";
  targets: QueryKey[];
};
