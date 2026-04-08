import { Button } from "@camox/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camox/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@camox/ui/dropdown-menu";
import { Input } from "@camox/ui/input";
import { Label } from "@camox/ui/label";
import { Toaster } from "@camox/ui/toaster";
import { UserButton } from "@daveyplate/better-auth-ui";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { ChevronsUpDownIcon, PlusIcon, SettingsIcon, UsersIcon } from "lucide-react";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { organizationQueries } from "@/lib/queries";

export const Route = createFileRoute("/_app/dashboard")({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: DashboardLayout,
});

function OrganizationPicker() {
  const navigate = useNavigate();
  const { orgSlug } = useParams({ strict: false });

  const { data: organizations } = useQuery(organizationQueries.list());

  const activeOrg = organizations?.find((org) => org.slug === orgSlug);
  const otherOrgs = organizations?.filter((org) => org.slug !== orgSlug);

  const handleSetActive = (newOrgSlug: string) => {
    navigate({ to: "/dashboard/$orgSlug", params: { orgSlug: newOrgSlug } });
  };

  const [createOpen, setCreateOpen] = useState(false);

  if (!activeOrg) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <span className="max-w-32 truncate font-medium">{activeOrg.name}</span>
            <ChevronsUpDownIcon className="text-muted-foreground h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
            {activeOrg.name}
          </DropdownMenuLabel>

          <DropdownMenuItem asChild>
            <Link
              to="/dashboard/$orgSlug/team"
              params={{ orgSlug: orgSlug! }}
              search={{ tab: "members" }}
            >
              <UsersIcon className="mr-2 h-4 w-4" />
              Members
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              to="/dashboard/$orgSlug/team"
              params={{ orgSlug: orgSlug! }}
              search={{ tab: "settings" }}
            >
              <SettingsIcon className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>

          {otherOrgs && otherOrgs.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                Switch organization
              </DropdownMenuLabel>
              {otherOrgs.map((org) => (
                <DropdownMenuItem key={org.id} onSelect={() => handleSetActive(org.slug)}>
                  {org.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Create organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function CreateOrganizationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: { name: "", slug: "" },
    onSubmit: async ({ value }) => {
      await authClient.organization.create({ name: value.name, slug: value.slug });
      onOpenChange(false);
      form.reset();
      navigate({ to: "/dashboard/$orgSlug", params: { orgSlug: value.slug } });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          form.reset();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>
            Add a new organization to collaborate with your team.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="grid gap-4 py-2"
        >
          <form.Field
            name="name"
            validators={{
              onSubmit: ({ value }) => {
                if (!value.trim()) return "Name is required";
                return undefined;
              },
            }}
          >
            {(field) => (
              <div className="grid gap-2">
                <Label htmlFor="org-name">Name</Label>
                <Input
                  id="org-name"
                  value={field.state.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                    if (!form.getFieldMeta("slug")?.isDirty) {
                      form.setFieldValue("slug", slugify(e.target.value), {
                        dontUpdateMeta: true,
                      });
                    }
                  }}
                  placeholder="Acme Inc."
                  aria-invalid={!!field.state.meta.errors.length}
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-destructive text-xs">{field.state.meta.errors[0]}</p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field
            name="slug"
            validators={{
              onSubmit: ({ value }) => {
                if (!value.trim()) return "Slug is required";
                if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
                  return "Slug must be lowercase alphanumeric with hyphens";
                }
                return undefined;
              },
            }}
          >
            {(field) => (
              <div className="grid gap-2">
                <Label htmlFor="org-slug">Slug</Label>
                <Input
                  id="org-slug"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="acme-inc"
                  aria-invalid={!!field.state.meta.errors.length}
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="text-destructive text-xs">{field.state.meta.errors[0]}</p>
                )}
              </div>
            )}
          </form.Field>

          <DialogFooter>
            <form.Subscribe selector={(state) => [state.isSubmitting, state.canSubmit]}>
              {([isSubmitting, canSubmit]) => (
                <Button type="submit" disabled={isSubmitting || !canSubmit}>
                  {isSubmitting ? "Creating\u2026" : "Create"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DashboardNavbar() {
  const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string };

  return (
    <header className="border-b">
      <div className="flex h-14 items-center gap-4 px-6">
        <Link
          to={orgSlug ? "/dashboard/$orgSlug" : "/dashboard"}
          params={orgSlug ? { orgSlug } : {}}
        >
          <img src="/logo-shape.svg" alt="camox logo" className="h-8 py-1" />
        </Link>
        <OrganizationPicker />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
            <Link to="/">camox.ai</Link>
          </Button>
          <UserButton variant="outline" size="icon" />
        </div>
      </div>
    </header>
  );
}

function DashboardLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <Toaster />
      <DashboardNavbar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
