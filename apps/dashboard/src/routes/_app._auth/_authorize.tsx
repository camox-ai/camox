import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_auth/_authorize")({
  component: AuthorizeLayout,
});

function AuthorizeLayout() {
  const { session } = Route.useRouteContext();

  return (
    <div className="bg-card w-full max-w-md rounded-lg border p-8">
      <div className="flex flex-col items-center gap-6">
        <p className="text-muted-foreground text-sm">
          Connected as <span className="text-foreground font-medium">{session?.user?.email}</span>
        </p>
        <Outlet />
      </div>
    </div>
  );
}
