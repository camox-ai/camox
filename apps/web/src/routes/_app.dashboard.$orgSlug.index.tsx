import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { CreateProjectGuide } from "@/components/CreateProjectGuide";
import { organizationQueries, projectQueries } from "@/lib/queries";

export const Route = createFileRoute("/_app/dashboard/$orgSlug/")({
  component: OrgIndex,
});

function OrgIndex() {
  const { orgSlug } = Route.useParams();

  const { data: organizations } = useQuery(organizationQueries.list());
  const activeOrg = organizations?.find((org) => org.slug === orgSlug);

  const { data: projects, isLoading } = useQuery({
    ...projectQueries.list(activeOrg?.id ?? ""),
    enabled: !!activeOrg,
  });

  if (isLoading || !projects) return null;

  if (projects.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <CreateProjectGuide />
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-4">
      {projects.map((project) => (
        <Link
          key={project.id}
          to="/dashboard/$orgSlug/$projectSlug/overview"
          params={{ orgSlug, projectSlug: project.slug }}
          className="bg-card hover:bg-accent/50 rounded-md border p-5 transition-colors"
        >
          <h2 className="font-medium">{project.name}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{project.slug}</p>
        </Link>
      ))}
    </div>
  );
}
