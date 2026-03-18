import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ConvexReactClient } from "convex/react";

import { authClient } from "@/lib/auth-client";
import { getToken } from "@/lib/auth-server";

const convexUrl = import.meta.env.VITE_CONVEX_URL!;
const convexClient = new ConvexReactClient(convexUrl);

const getAuth = createServerFn({ method: "GET" }).handler(async () => {
  return await getToken();
});

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const token = await getAuth();
    return { isAuthenticated: !!token, token };
  },
  component: AppLayout,
});

function AppLayout() {
  const { token } = Route.useRouteContext();
  return (
    <ConvexBetterAuthProvider client={convexClient} authClient={authClient} initialToken={token}>
      <Outlet />
    </ConvexBetterAuthProvider>
  );
}
