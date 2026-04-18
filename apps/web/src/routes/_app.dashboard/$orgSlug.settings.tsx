import { OrganizationSettingsCards } from "@daveyplate/better-auth-ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard/$orgSlug/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [{ title: "Settings – Camox Dashboard" }],
  }),
});

function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <OrganizationSettingsCards />
    </div>
  );
}
