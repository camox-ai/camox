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

  if (auth.isLoading) {
    let pending = authPromiseCache.get(auth);
    if (!pending) {
      pending = new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!auth.isLoading) {
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

function DashboardLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Toaster />
      <header className="border-b">
        <div className="flex items-center justify-between px-6 py-2">
          <Link to="/dashboard" className="text-lg font-semibold tracking-tight">
            camox
          </Link>
          <UserButton size="sm" variant="outline" />
        </div>
      </header>
      <Suspense
        fallback={
          <main className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground">Loading…</p>
          </main>
        }
      >
        <AwaitAuth>
          <main className="p-6">
            <Outlet />
          </main>
        </AwaitAuth>
      </Suspense>
    </div>
  );
}
