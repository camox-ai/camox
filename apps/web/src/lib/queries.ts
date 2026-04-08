import { queryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export const organizationQueries = {
  all: () => ["organization"] as const,

  active: () =>
    queryOptions({
      queryKey: [...organizationQueries.all(), "active"] as const,
      queryFn: async () => {
        const { data } = await authClient.organization.getFullOrganization();
        return data;
      },
    }),

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

  list: (orgSlug: string) =>
    queryOptions({
      queryKey: [...projectQueries.all(), "list", orgSlug] as const,
      queryFn: () => api.projects.list({ organizationSlug: orgSlug }),
    }),

  getBySlug: (slug: string) =>
    queryOptions({
      queryKey: [...projectQueries.all(), "getBySlug", slug] as const,
      queryFn: () => api.projects.getBySlug({ slug }),
    }),
};
