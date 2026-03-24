import { Button } from "@camox/ui/button";
import { Toaster } from "@camox/ui/toaster";
import { UserButton } from "@daveyplate/better-auth-ui";
import { Link, Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { Suspense } from "react";

export const Route = createFileRoute("/_app/dashboard")({
  beforeLoad: ({ context }) => {
    if (!context.isAuthenticated) {
      throw redirect({ to: "/login", search: { redirect: undefined } });
    }
  },
  component: DashboardLayout,
});

const authPromiseCache = new WeakMap<object, Promise<void>>();

function AwaitAuth({ children }: { children: React.ReactNode }) {
  const auth = useConvexAuth();

  if (auth.isLoading || !auth.isAuthenticated) {
    let pending = authPromiseCache.get(auth);
    if (!pending) {
      pending = new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!auth.isLoading && auth.isAuthenticated) {
            clearInterval(check);
            resolve();
          }
        }, 50);
      });
      authPromiseCache.set(auth, pending);
    }
    throw pending;
  }

  return children;
}

function DashboardNavbar() {
  return (
    <header className="border-b">
      <div className="flex h-14 items-center gap-4 px-6">
        <Link to="/dashboard">
          <img src="/logo-shape.svg" alt="camox logo" className="h-8 py-1" />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
            <Link to="/">camox.ai</Link>
          </Button>
          <UserButton variant="outline" size="icon" />
        </div>
      </div>
    </header>
  );
}

function DashboardLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <Toaster />
      <Suspense
        fallback={
          <main className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground">Loading…</p>
          </main>
        }
      >
        <AwaitAuth>
          <DashboardNavbar />
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </AwaitAuth>
      </Suspense>
    </div>
  );
}
