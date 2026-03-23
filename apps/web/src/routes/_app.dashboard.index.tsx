import { api } from "@camox/backend-management/_generated/api";
import { Button } from "@camox/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@camox/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@camox/ui/popover";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard/")({
  component: DashboardHome,
  head: () => ({
    meta: [{ title: "Camox Dashboard" }],
  }),
  validateSearch: z.object({
    project: z.string().optional(),
  }),
});

function ProjectSelector() {
  const [open, setOpen] = useState(false);
  const { project: selectedSlug } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.listProjects, { organizationId: "seed" }),
  );
  const selectedProject = projects.find((p) => p.slug === selectedSlug);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-75 justify-between"
        >
          {selectedProject ? selectedProject.name : "Select a project..."}
          <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-75 p-0">
        <Command>
          <CommandInput placeholder="Search projects..." />
          <CommandList>
            <CommandEmpty>No project found.</CommandEmpty>
            <CommandGroup>
              {projects.map((project) => (
                <CommandItem
                  key={project._id}
                  value={project.slug}
                  keywords={[project.name, project.domain]}
                  onSelect={(slug) => {
                    navigate({ search: { project: slug }, replace: true });
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 size-4",
                      selectedSlug === project.slug ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div>
                    <p className="font-medium">{project.name}</p>
                    <p className="text-muted-foreground text-xs">{project.domain}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
