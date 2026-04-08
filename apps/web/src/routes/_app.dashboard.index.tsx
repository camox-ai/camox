import { useQuery } from "@tanstack/react-query";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { FolderIcon } from "lucide-react";

import { organizationQueries, projectQueries } from "@/lib/queries";

export const Route = createFileRoute("/_app/dashboard/")({
  head: () => ({
    meta: [{ title: "Camox Dashboard" }],
  }),
  component: DashboardIndex,
});

function DashboardIndex() {
  const { data: organizations } = useQuery(organizationQueries.list());

  const firstOrgSlug = organizations?.[0]?.slug;

  const { data: projects, isLoading } = useQuery({
    ...projectQueries.list(firstOrgSlug ?? ""),
    enabled: !!firstOrgSlug,
  });

  if (isLoading || !organizations || !projects) return null;

  if (projects.length > 0) {
    return (
      <Navigate
        to="/dashboard/$orgSlug/$slug/overview"
        params={{ orgSlug: firstOrgSlug!, slug: projects[0]!.slug }}
        replace
      />
    );
  }

  if (firstOrgSlug) {
    return (
      <Navigate
        to="/dashboard/$orgSlug/team"
        params={{ orgSlug: firstOrgSlug }}
        search={{ tab: "members" }}
        replace
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="text-muted-foreground flex flex-col items-center gap-3 py-20 text-center">
        <FolderIcon className="h-10 w-10" />
        <h2 className="text-foreground text-lg font-semibold">No organizations found</h2>
      </div>
    </div>
  );
}
