import { Button } from "@camox/ui/button";
import { OrganizationMembersCard } from "@daveyplate/better-auth-ui";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard/team/$slug")({
  component: TeamPage,
  head: () => ({
    meta: [{ title: "Team – Camox Dashboard" }],
  }),
});

function TeamPage() {
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
      <div className="mx-auto max-w-2xl">
        <OrganizationMembersCard />
      </div>
    </div>
  );
}
