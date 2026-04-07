import { useQuery } from "@tanstack/react-query";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { FolderIcon } from "lucide-react";

import { api } from "@/lib/api";

export const Route = createFileRoute("/_app/dashboard/")({
  head: () => ({
    meta: [{ title: "Camox Dashboard" }],
  }),
  component: DashboardIndex,
});

function DashboardIndex() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects", "list"],
    queryFn: () => api.projects.list(),
  });

  if (isLoading || !projects) return null;

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
