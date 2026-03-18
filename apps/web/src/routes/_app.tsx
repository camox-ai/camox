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
  head: () => ({
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
      },
    ],
  }),
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
      <div className="font-['Inter',sans-serif] antialiased">
        <Outlet />
      </div>
    </ConvexBetterAuthProvider>
  );
}
