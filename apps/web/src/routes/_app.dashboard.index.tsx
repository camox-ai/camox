import { api } from "@camox/backend-management/_generated/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@camox/ui/select";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { queryClient } from "@/lib/convex";

export const Route = createFileRoute("/_app/dashboard/")({
  component: DashboardHome,
  head: () => ({
    meta: [{ title: "Camox Dashboard" }],
  }),
  validateSearch: z.object({
    project: z.string().optional(),
  }),
  beforeLoad: async ({ search }) => {
    if (search.project) return;

    const projects = await queryClient.ensureQueryData(
      convexQuery(api.projects.listProjects, { organizationId: "seed" }),
    );
    if (projects.length === 0) return;

    const mostRecent = projects.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    throw redirect({
      to: "/dashboard",
      search: { project: mostRecent.slug },
      replace: true,
    });
  },
});

function ProjectSelector() {
  const { project: selectedSlug } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.listProjects, { organizationId: "seed" }),
  );

  return (
    <Select
      value={selectedSlug}
      onValueChange={(slug) => navigate({ search: { project: slug }, replace: true })}
    >
      <SelectTrigger className="w-75">
        <SelectValue placeholder="Select a project..." />
      </SelectTrigger>
      <SelectContent>
        {projects.map((project) => (
          <SelectItem key={project._id} value={project.slug}>
            {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ProjectDetails() {
  const { project: selectedSlug } = Route.useSearch();

  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.listProjects, { organizationId: "seed" }),
  );

  const project = projects.find((p) => p.slug === selectedSlug);

  if (!selectedSlug || !project) return null;

  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-lg font-semibold">{project.name}</h2>
      <dl className="text-muted-foreground mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="font-medium">Slug</dt>
        <dd className="font-mono">{project.slug}</dd>
        <dt className="font-medium">Domain</dt>
        <dd>{project.domain}</dd>
        <dt className="font-medium">Created</dt>
        <dd>{new Date(project.createdAt).toLocaleDateString()}</dd>
      </dl>
    </div>
  );
}

function DashboardHome() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
      <ProjectSelector />
      <ProjectDetails />
    </div>
  );
}
