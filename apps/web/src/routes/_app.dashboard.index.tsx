import { api } from "@camox/backend-management/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { queryClient } from "@/lib/convex";

export const Route = createFileRoute("/_app/dashboard/")({
  head: () => ({
    meta: [{ title: "Camox Dashboard" }],
  }),
  beforeLoad: async () => {
    const projects = await queryClient.ensureQueryData(
      convexQuery(api.projects.listProjects, { organizationId: "seed" }),
    );
    if (projects.length === 0) return;

    const mostRecent = projects.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    throw redirect({
      to: "/dashboard/$slug",
      params: { slug: mostRecent.slug },
      replace: true,
    });
  },
  component: () => null,
});
