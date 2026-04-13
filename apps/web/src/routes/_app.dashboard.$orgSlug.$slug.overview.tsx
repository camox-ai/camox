import { Button } from "@camox/ui/button";
import { Input } from "@camox/ui/input";
import { Label } from "@camox/ui/label";
import { Spinner } from "@camox/ui/spinner";
import { toast } from "@camox/ui/toaster";
import { Tooltip, TooltipContent, TooltipTrigger } from "@camox/ui/tooltip";
import { useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { api, type Project } from "@/lib/api";
import { projectQueries } from "@/lib/queries";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-8">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

export const Route = createFileRoute("/_app/dashboard/$orgSlug/$slug/overview")({
  component: ProjectSettingsPage,
  head: () => ({
    meta: [{ title: "Camox Dashboard" }],
  }),
});

function ProjectSettingsFormInner({ project }: { project: Project }) {
  const form = useForm({
    defaultValues: {
      name: project.name,
    },
    onSubmit: async ({ value }) => {
      try {
        await api.projects.update({
          id: project.id,
          name: value.name,
        });
        toast.success("Project settings updated");
      } catch (error) {
        console.error("Failed to update project:", error);
        toast.error("Could not update project settings");
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
      className="space-y-4"
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

      <form.Subscribe selector={(state) => [state.isDirty, state.isSubmitting, state.canSubmit]}>
        {([isDirty, isSubmitting, canSubmit]) => (
          <Button type="submit" disabled={!isDirty || isSubmitting || !canSubmit}>
            {isSubmitting && <Spinner />}
            Save changes
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

function ProjectCredentialsSection({ slug, secret }: { slug: string; secret: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="project-slug">Project slug</Label>
        <div className="flex items-center gap-2">
          <Input id="project-slug" readOnly value={slug} className="font-mono" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(slug);
                  toast.success("Slug copied to clipboard");
                }}
              >
                <CopyIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy slug</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sync-secret">Sync secret</Label>
        <div className="flex items-center gap-2">
          <Input
            id="sync-secret"
            readOnly
            value={revealed ? secret : "*".repeat(secret.length)}
            className="font-mono"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setRevealed((v) => !v)}
              >
                {revealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{revealed ? "Hide secret" : "Reveal secret"}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        className="-mt-2"
        onClick={() => {
          navigator.clipboard.writeText(secret);
          toast.success("Secret copied to clipboard");
        }}
      >
        <CopyIcon className="size-4" />
        Copy secret
      </Button>
    </div>
  );
}

function ProjectSettingsPage() {
  const { slug } = Route.useParams();

  const { data: project } = useSuspenseQuery(projectQueries.getBySlug(slug));

  if (!project) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-12">
      <Section title="Project settings" description="Manage your project's general configuration.">
        <ProjectSettingsFormInner key={project.id} project={project} />
      </Section>
      <Section
        title="Project credentials"
        description="Keys and secrets used to connect external services to this project."
      >
        <ProjectCredentialsSection slug={project.slug} secret={project.syncSecret} />
      </Section>
    </div>
  );
}
