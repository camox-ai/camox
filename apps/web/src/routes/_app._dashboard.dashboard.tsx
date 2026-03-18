import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_dashboard/dashboard")({
  component: DashboardHome,
});

function DashboardHome() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground">Your projects will appear here.</p>
    </div>
  );
}
