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

  const firstOrg = organizations?.[0];

  const { data: projects, isLoading } = useQuery({
    ...projectQueries.list(firstOrg?.id ?? ""),
    enabled: !!firstOrg,
  });

  if (isLoading || !organizations || !projects) return null;

  if (projects.length > 0 && firstOrg) {
    return (
      <Navigate
        to="/dashboard/$orgSlug/$projectSlug/overview"
        params={{ orgSlug: firstOrg.slug, projectSlug: projects[0]!.slug }}
        replace
      />
    );
  }

  if (firstOrg) {
    return <Navigate to="/dashboard/$orgSlug" params={{ orgSlug: firstOrg.slug }} replace />;
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
