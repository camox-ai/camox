import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard/$orgSlug/$projectSlug/usage")({
  component: UsagePage,
  head: () => ({
    meta: [{ title: "Usage – Camox Dashboard" }],
  }),
});

function UsagePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-muted-foreground">Coming soon</p>
    </div>
  );
}
