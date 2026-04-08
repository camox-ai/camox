import { cn } from "@camox/ui/utils";
import { OrganizationMembersCard, OrganizationSettingsCards } from "@daveyplate/better-auth-ui";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
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

  const tabClass = "border-b-2 px-1 py-4 text-sm font-medium";
  const activeClass = "border-foreground text-foreground";
  const inactiveClass =
    "text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 border-transparent";

  return (
    <div>
      <div className="border-b px-6">
        <nav className="-mb-px flex items-center gap-4">
          <Link
            to="/dashboard/$orgSlug/team"
            params={{ orgSlug }}
            search={{ tab: "members" }}
            className={cn(tabClass, tab === "members" ? activeClass : inactiveClass)}
          >
            Members
          </Link>
          <Link
            to="/dashboard/$orgSlug/team"
            params={{ orgSlug }}
            search={{ tab: "settings" }}
            className={cn(tabClass, tab === "settings" ? activeClass : inactiveClass)}
          >
            Settings
          </Link>
        </nav>
      </div>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
        {tab === "settings" ? <OrganizationSettingsCards /> : <OrganizationMembersCard />}
      </div>
    </div>
  );
}
