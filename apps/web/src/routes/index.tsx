import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

// Placeholder for a page that will be managed by Camox in the future
function RouteComponent() {
  return (
    <main className="flex h-screen w-full flex-col items-center justify-center gap-4">
      <h1 className="text-center text-8xl font-extrabold tracking-tighter">camox.ai</h1>
      <Link to="/dashboard" className="text-primary">
        Dashboard
      </Link>
    </main>
  );
}
