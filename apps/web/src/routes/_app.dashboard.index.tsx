import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { FolderIcon } from "lucide-react";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";
import { organizationQueries, projectQueries } from "@/lib/queries";

export const Route = createFileRoute("/_app/dashboard/")({
  head: () => ({
    meta: [{ title: "Camox Dashboard" }],
  }),
  component: DashboardIndex,
});

function DashboardIndex() {
  const queryClient = useQueryClient();

  const { data: activeOrg } = useQuery(organizationQueries.active());
  const { data: organizations } = useQuery(organizationQueries.list());

  useEffect(() => {
    if (activeOrg || !organizations?.length) return;
    authClient.organization.setActive({ organizationId: organizations[0]!.id }).then(() => {
      queryClient.invalidateQueries({ queryKey: organizationQueries.active().queryKey });
    });
  }, [activeOrg, organizations, queryClient]);

  const { data: projects, isLoading } = useQuery({
    ...projectQueries.list(activeOrg?.slug ?? ""),
    enabled: !!activeOrg?.slug,
  });

  if (isLoading || !activeOrg || !projects) return null;

  if (projects.length > 0) {
    return <Navigate to="/dashboard/$slug/overview" params={{ slug: projects[0]!.slug }} replace />;
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="text-muted-foreground flex flex-col items-center gap-3 py-20 text-center">
        <FolderIcon className="h-10 w-10" />
        <h2 className="text-foreground text-lg font-semibold">No projects yet</h2>
        <p className="text-sm">Projects are created via the CLI.</p>
      </div>
    </div>
  );
}
