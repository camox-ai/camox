import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard/$slug")({
  component: RouteComponent,
});

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@camox/ui/select";
import { cn } from "@camox/ui/utils";
import { useSuspenseQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

function ProjectSelector() {
  const { slug: selectedSlug } = useParams({ strict: false }) as { slug?: string };
  const navigate = useNavigate();

  const { data: projects } = useSuspenseQuery({
    queryKey: ["projects", "list"],
    queryFn: () => api.projects.list(),
  });

  return (
    <Select
      value={selectedSlug}
      onValueChange={(slug) =>
        navigate({ to: "/dashboard/$slug", params: { slug }, replace: true })
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
  const { slug } = Route.useParams();

  const { data: project } = useSuspenseQuery({
    queryKey: ["projects", "getBySlug", slug],
    queryFn: () => api.projects.getBySlug({ slug }),
  });

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
            to="/dashboard/$slug/overview"
            params={{ slug }}
            className={tabClass}
            activeProps={{ className: activeClass }}
            inactiveProps={{ className: inactiveClass }}
          >
            Overview
          </Link>
          <Link
            to="/dashboard/$slug/usage"
            params={{ slug }}
            className={tabClass}
            activeProps={{ className: activeClass }}
            inactiveProps={{ className: inactiveClass }}
          >
            Usage
          </Link>
          <Link
            to="/dashboard/team"
            search={{ tab: "members" }}
            className={cn(tabClass, inactiveClass)}
          >
            Team
          </Link>
        </nav>
      </div>
      <div className="p-6">
        <Outlet />
      </div>
    </div>
  );
}
