import { Tabs, TabsList, TabsTrigger } from "@camox/ui/tabs";
import { OrganizationMembersCard, OrganizationSettingsCards } from "@daveyplate/better-auth-ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";
import { organizationQueries } from "@/lib/queries";

const tabs = ["members", "settings"] as const;
type Tab = (typeof tabs)[number];

export const Route = createFileRoute("/_app/dashboard/$orgSlug/team")({
  component: TeamPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: tabs.includes(search.tab as Tab) ? (search.tab as Tab) : undefined,
  }),
  head: () => ({
    meta: [{ title: "Team – Camox Dashboard" }],
  }),
});

function TeamPage() {
  const { orgSlug } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();

  const { data: organizations } = useQuery(organizationQueries.list());
  const activeOrg = organizations?.find((org) => org.slug === orgSlug);

  // Sync active org to session for better-auth-ui compatibility
  useEffect(() => {
    if (!activeOrg) return;
    authClient.organization.setActive({ organizationId: activeOrg.id });
  }, [activeOrg]);

  useEffect(() => {
    if (!tab) {
      navigate({
        to: "/dashboard/$orgSlug/team",
        params: { orgSlug },
        search: { tab: "members" },
        replace: true,
      });
    }
  }, [tab, navigate, orgSlug]);

  const activeTab = tab ?? "members";

  return (
    <div className="flex flex-col items-stretch gap-6 py-6">
      <div className="px-6">
        <Tabs value={activeTab} className="mx-auto max-w-4xl">
          <TabsList>
            <TabsTrigger
              value="members"
              nativeButton={false}
              render={
                <Link
                  to="/dashboard/$orgSlug/team"
                  params={{ orgSlug }}
                  search={{ tab: "members" }}
                />
              }
            >
              Members
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              nativeButton={false}
              render={
                <Link
                  to="/dashboard/$orgSlug/team"
                  params={{ orgSlug }}
                  search={{ tab: "settings" }}
                />
              }
            >
              Settings
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        {activeTab === "settings" ? <OrganizationSettingsCards /> : <OrganizationMembersCard />}
      </div>
    </div>
  );
}
