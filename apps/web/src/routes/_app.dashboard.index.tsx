import { api } from "@camox/backend-management/_generated/api";
import type { Doc } from "@camox/backend-management/_generated/dataModel";
import { Button } from "@camox/ui/button";
import { Input } from "@camox/ui/input";
import { Label } from "@camox/ui/label";
import { Spinner } from "@camox/ui/spinner";
import { Textarea } from "@camox/ui/textarea";
import { toast } from "@camox/ui/toaster";
import { convexQuery } from "@convex-dev/react-query";
import { useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation } from "convex/react";
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

function ProjectSettingsFormInner({ project }: { project: Doc<"projects"> }) {
  const updateProject = useMutation(api.projects.updateProject);

  const form = useForm({
    defaultValues: {
      name: project.name,
      description: project.description ?? "",
      domain: project.domain,
    },
    onSubmit: async ({ value }) => {
      try {
        await updateProject({
          projectId: project._id,
          name: value.name,
          description: value.description,
          domain: value.domain,
        });
        toast.success("Project settings updated");
      } catch (error) {
        console.error("Failed to update project:", error);
        toast.error("Could not update project settings");
      }
    },
  });

  return (
    <div>
      <h2 className="text-lg font-semibold">Project settings</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        className="mt-4 space-y-4"
      >
        <form.Field
          name="name"
          validators={{
            onSubmit: ({ value }) => {
              if (!value || value.trim().length === 0) {
                return "Project name is required";
              }
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="name">Project name</Label>
              <Input
                id="name"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={!!field.state.meta.errors.length}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-destructive text-xs">{field.state.meta.errors[0]}</p>
              )}
            </div>
          )}
        </form.Field>

        <form.Field name="description">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                rows={3}
              />
              <p className="text-muted-foreground text-xs">A brief description of your project</p>
            </div>
          )}
        </form.Field>

        <form.Field
          name="domain"
          validators={{
            onSubmit: ({ value }) => {
              if (!value || value.trim().length === 0) {
                return "Domain is required";
              }
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                aria-invalid={!!field.state.meta.errors.length}
              />
              {field.state.meta.errors.length > 0 && (
                <p className="text-destructive text-xs">{field.state.meta.errors[0]}</p>
              )}
              <p className="text-muted-foreground text-xs">Your project's domain name</p>
            </div>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => [state.isDirty, state.isSubmitting, state.canSubmit]}>
          {([isDirty, isSubmitting, canSubmit]) => (
            <Button type="submit" disabled={!isDirty || isSubmitting || !canSubmit}>
              {isSubmitting && <Spinner />}
              Save changes
            </Button>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}

function ProjectSettingsForm() {
  const { project: selectedSlug } = Route.useSearch();

  const { data: project } = useSuspenseQuery(
    convexQuery(api.projects.getProjectBySlug, selectedSlug ? { slug: selectedSlug } : "skip"),
  );

  if (!selectedSlug || !project) return null;

  return <ProjectSettingsFormInner key={project._id} project={project} />;
}

function DashboardHome() {
  return (
    <div className="space-y-4">
      <ProjectSettingsForm />
    </div>
  );
}
