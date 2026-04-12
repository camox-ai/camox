import { queryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export const organizationQueries = {
  all: () => ["organization"] as const,

  list: () =>
    queryOptions({
      queryKey: [...organizationQueries.all(), "list"] as const,
      queryFn: async () => {
        const { data } = await authClient.organization.list();
        return data;
      },
    }),
};

export const projectQueries = {
  all: () => ["projects"] as const,

  list: (organizationId: string) =>
    queryOptions({
      queryKey: [...projectQueries.all(), "list", organizationId] as const,
      queryFn: () => api.projects.list({ organizationId }),
    }),

  getBySlug: (slug: string) =>
    queryOptions({
      queryKey: [...projectQueries.all(), "getBySlug", slug] as const,
      queryFn: () => api.projects.getBySlug({ slug }),
    }),
};
