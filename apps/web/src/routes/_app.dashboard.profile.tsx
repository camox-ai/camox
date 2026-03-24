import { cn } from "@camox/ui/utils";
import {
  AccountSettingsCards,
  SecuritySettingsCards,
  UserButton,
} from "@daveyplate/better-auth-ui";
import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

const tabs = ["account", "security"] as const;
type Tab = (typeof tabs)[number];

export const Route = createFileRoute("/_app/dashboard/profile")({
  beforeLoad: ({ context }) => {
    if (!context.isAuthenticated) {
      throw redirect({ to: "/login", search: { redirect: undefined } });
    }
  },
  component: ProfilePage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: tabs.includes(search.tab as Tab) ? (search.tab as Tab) : undefined,
  }),
  head: () => ({
    meta: [{ title: "Profile – Camox Dashboard" }],
  }),
});

function ProfilePage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    if (!tab) {
      navigate({ to: "/dashboard/profile", search: { tab: "account" }, replace: true });
    }
  }, [tab, navigate]);

  const tabClass = "border-b-2 px-1 py-4 text-sm font-medium";
  const activeClass = "border-foreground text-foreground";
  const inactiveClass =
    "text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 border-transparent";

  return (
    <div>
      <div className="border-b px-6">
        <nav className="-mb-px flex items-center gap-4">
          <UserButton variant="ghost" size="sm" />
          <Link
            to="/dashboard/profile"
            search={{ tab: "account" }}
            className={cn(tabClass, tab === "account" ? activeClass : inactiveClass)}
          >
            Account
          </Link>
          <Link
            to="/dashboard/profile"
            search={{ tab: "security" }}
            className={cn(tabClass, tab === "security" ? activeClass : inactiveClass)}
          >
            Security
          </Link>
        </nav>
      </div>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
        {tab === "security" ? <SecuritySettingsCards /> : <AccountSettingsCards />}
      </div>
    </div>
  );
}
