import { useQuery } from "@tanstack/react-query";
import { Navigate, createFileRoute } from "@tanstack/react-router";

import { CreateProjectGuide } from "@/components/CreateProjectGuide";
import { projectQueries } from "@/lib/queries";

export const Route = createFileRoute("/_app/dashboard/$orgSlug/")({
  component: OrgIndex,
});

function OrgIndex() {
  const { orgSlug } = Route.useParams();

  const { data: projects, isLoading } = useQuery(projectQueries.list(orgSlug));

  if (isLoading || !projects) return null;

  if (projects.length > 0) {
    return (
      <Navigate
        to="/dashboard/$orgSlug/$slug/overview"
        params={{ orgSlug, slug: projects[0]!.slug }}
        replace
      />
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <CreateProjectGuide />
    </div>
  );
}
