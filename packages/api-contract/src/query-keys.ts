/**
 * Use TypeScript to enforce 'camox' as the first query key to ensure they're all namespaced.
 * This is because the Tanstack Query client on the frontend may be shared with the user's routes,
 * so we ensure there won't be any key collisions.
 */
export type QueryKey = [first: "camox", ...rest: Array<string | number>];
type QueryKeyGroup = Record<string, QueryKey | ((...args: any[]) => QueryKey)>;

export const queryKeys = {
  pages: {
    list: ["camox", "pages", "list"],
    getByPath: (path: string) => ["camox", "pages", "getByPath", path],
    getByPathAll: ["camox", "pages", "getByPath"],
    getById: (id: number) => ["camox", "pages", "getById", id],
  },
  files: {
    list: ["camox", "files", "list"],
    get: (id: number) => ["camox", "files", "get", id],
  },
  blocks: {
    get: (id: number) => ["camox", "blocks", "get", id],
    getUsageCounts: ["camox", "blocks", "getUsageCounts"],
    getPageMarkdown: (pageId: number) => ["camox", "blocks", "getPageMarkdown", pageId],
  },
  repeatableItems: {
    get: (id: number) => ["camox", "repeatableItems", "get", id],
  },
  layouts: {
    all: ["camox", "layouts"],
  },
} satisfies Record<string, QueryKeyGroup>;

export type InvalidationMessage = {
  type: "invalidate";
  targets: QueryKey[];
};
