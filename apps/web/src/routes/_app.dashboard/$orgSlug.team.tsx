import { OrganizationMembersCard } from "@daveyplate/better-auth-ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard/$orgSlug/team")({
  component: TeamPage,
  head: () => ({
    meta: [{ title: "Members – Camox Dashboard" }],
  }),
});

function TeamPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <OrganizationMembersCard />
    </div>
  );
}
