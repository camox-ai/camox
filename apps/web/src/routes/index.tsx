import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <h1 className="text-primary fixed top-1/2 left-1/2 -translate-1/2 text-8xl font-extrabold tracking-tighter">
      camox.ai
    </h1>
  );
}
