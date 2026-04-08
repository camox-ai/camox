import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard/$orgSlug/$slug/usage")({
  component: UsagePage,
  head: () => ({
    meta: [{ title: "Usage – Camox Dashboard" }],
  }),
});

function UsagePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-muted-foreground">Coming soon</p>
    </div>
  );
}
