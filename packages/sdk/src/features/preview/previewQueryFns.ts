import { type ReadSource } from "@camox/api-contract/query-keys";
import { type useQueryClient } from "@tanstack/react-query";

import { getApiClient } from "@/lib/api-client";
import { seedBlockCaches } from "@/lib/normalized-data";

export function pageFullQueryFn(
  queryClient: ReturnType<typeof useQueryClient>,
  path: string,
  projectSlug: string,
  source: ReadSource,
) {
  return async () => {
    const data = await getApiClient().pages.getByPath({ path, projectSlug, source });
    seedBlockCaches(queryClient, data, source);
    return {
      page: data.page,
      layout: data.layout,
      projectName: data.projectName,
      project: data.project,
    };
  };
}
