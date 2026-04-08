import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@camox/ui/select";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";

import { projectQueries } from "@/lib/queries";

export const Route = createFileRoute("/_app/dashboard/$orgSlug/$slug")({
  component: RouteComponent,
});

function ProjectSelector() {
  const { orgSlug, slug: selectedSlug } = Route.useParams();
  const navigate = useNavigate();

  const { data: projects } = useSuspenseQuery(projectQueries.list(orgSlug));

  return (
    <Select
      value={selectedSlug}
      onValueChange={(slug) =>
        navigate({ to: "/dashboard/$orgSlug/$slug", params: { orgSlug, slug }, replace: true })
      }
    >
      <SelectTrigger className="w-40">
        <SelectValue placeholder="Select a project..." />
      </SelectTrigger>
      <SelectContent>
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.slug}>
            {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RouteComponent() {
  const { orgSlug, slug } = Route.useParams();

  const { data: project } = useSuspenseQuery(projectQueries.getBySlug(slug));

  const tabClass = "border-b-2 px-1 py-4 text-sm font-medium";
  const activeClass = "border-foreground text-foreground";
  const inactiveClass =
    "text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 border-transparent";

  if (!project) return null;

  return (
    <div>
      <div className="border-b px-6">
        <nav className="-mb-px flex items-center gap-4">
          <div className="py-2">
            <ProjectSelector />
          </div>
          <Link
            to="/dashboard/$orgSlug/$slug/overview"
            params={{ orgSlug, slug }}
            className={tabClass}
            activeProps={{ className: activeClass }}
            inactiveProps={{ className: inactiveClass }}
          >
            Overview
          </Link>
          <Link
            to="/dashboard/$orgSlug/$slug/usage"
            params={{ orgSlug, slug }}
            className={tabClass}
            activeProps={{ className: activeClass }}
            inactiveProps={{ className: inactiveClass }}
          >
            Usage
          </Link>
        </nav>
      </div>
      <div className="p-6">
        <Outlet />
      </div>
    </div>
  );
}
