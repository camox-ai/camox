import { Tabs, TabsList, TabsTrigger } from "@camox/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useMatchRoute, useParams } from "@tanstack/react-router";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";
import { organizationQueries } from "@/lib/queries";

export const Route = createFileRoute("/_app/dashboard/$orgSlug")({
  component: OrgLayout,
});

function OrgLayout() {
  const { orgSlug } = Route.useParams();
  const matchRoute = useMatchRoute();

  const { data: organizations } = useQuery(organizationQueries.list());
  const activeOrg = organizations?.find((org) => org.slug === orgSlug);

  useEffect(() => {
    if (!activeOrg) return;
    authClient.organization.setActive({ organizationId: activeOrg.id });
  }, [activeOrg]);

  const { projectSlug } = useParams({ strict: false });

  if (projectSlug) return <Outlet />;

  const isTeam = matchRoute({
    to: "/dashboard/$orgSlug/team",
    params: { orgSlug },
  });
  const isSettings = matchRoute({
    to: "/dashboard/$orgSlug/settings",
    params: { orgSlug },
  });

  let activeTab = "projects";
  if (isSettings) activeTab = "settings";
  else if (isTeam) activeTab = "members";

  return (
    <div className="flex flex-col items-stretch gap-6 py-6">
      <div className="px-6">
        <Tabs value={activeTab} className="mx-auto max-w-4xl">
          <TabsList>
            <TabsTrigger
              value="projects"
              nativeButton={false}
              render={<Link to="/dashboard/$orgSlug" params={{ orgSlug }} />}
            >
              Projects
            </TabsTrigger>
            <TabsTrigger
              value="members"
              nativeButton={false}
              render={<Link to="/dashboard/$orgSlug/team" params={{ orgSlug }} />}
            >
              Members
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              nativeButton={false}
              render={<Link to="/dashboard/$orgSlug/settings" params={{ orgSlug }} />}
            >
              Settings
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Outlet />
    </div>
  );
}
