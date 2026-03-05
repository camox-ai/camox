import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_camox/cmx")({
  component: RouteComponent,
  loader: () => {
    throw redirect({ to: "/cmx-studio" });
  },
});

function RouteComponent() {
  return null;
}
