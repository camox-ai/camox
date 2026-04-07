import { Button } from "@camox/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@camox/ui/dropdown-menu";
import { Toaster } from "@camox/ui/toaster";
import { UserButton } from "@daveyplate/better-auth-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { ChevronsUpDownIcon, SettingsIcon, UsersIcon } from "lucide-react";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_app/dashboard")({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: DashboardLayout,
});

function OrganizationPicker() {
  const queryClient = useQueryClient();

  const { data: activeOrg } = useQuery({
    queryKey: ["organization", "active"],
    queryFn: async () => {
      const { data } = await authClient.organization.getFullOrganization();
      return data;
    },
  });

  const { data: organizations } = useQuery({
    queryKey: ["organization", "list"],
    queryFn: async () => {
      const { data } = await authClient.organization.list();
      return data;
    },
  });

  const otherOrgs = organizations?.filter((org) => org.id !== activeOrg?.id);

  const handleSetActive = async (orgId: string) => {
    await authClient.organization.setActive({ organizationId: orgId });
    await queryClient.invalidateQueries({ queryKey: ["organization"] });
  };

  if (!activeOrg) return null;

  return (
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
          <Link to="/dashboard/team" search={{ tab: "members" }}>
            <UsersIcon className="mr-2 h-4 w-4" />
            Members
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/dashboard/team" search={{ tab: "settings" }}>
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
              <DropdownMenuItem key={org.id} onSelect={() => handleSetActive(org.id)}>
                {org.name}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DashboardNavbar() {
  return (
    <header className="border-b">
      <div className="flex h-14 items-center gap-4 px-6">
        <Link to="/dashboard">
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
