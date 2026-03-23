import { Button } from "@camox/ui/button";
import { AccountSettingsCards, SecuritySettingsCards } from "@daveyplate/better-auth-ui";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

export const Route = createFileRoute("/_app/profile")({
  beforeLoad: ({ context }) => {
    if (!context.isAuthenticated) {
      throw redirect({ to: "/login", search: { redirect: undefined } });
    }
  },
  component: ProfilePage,
  head: () => ({
    meta: [{ title: "Camox Profile" }],
  }),
});

function ProfilePage() {
  return (
    <div>
      <div className="border-border border-b px-4 py-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard">
            <ArrowLeftIcon className="text-muted-foreground" />
            Dashboard
          </Link>
        </Button>
      </div>
      <div className="mx-auto max-w-5xl">
        <div className="border-border grid grid-cols-[1fr_2fr] gap-x-8 border-b px-4 py-4">
          <div>
            <p className="text-sm font-medium">Account</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Manage your personal information and preferences
            </p>
          </div>
          <div>
            <AccountSettingsCards />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_2fr] gap-x-8 px-4 py-4">
          <div>
            <p className="text-sm font-medium">Security</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Manage your password and authentication methods
            </p>
          </div>
          <div>
            <SecuritySettingsCards />
          </div>
        </div>
      </div>
    </div>
  );
}
