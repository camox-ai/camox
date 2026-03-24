import { api } from "@camox/backend-management/_generated/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@camox/ui/select";
import { Toaster } from "@camox/ui/toaster";
import { convexQuery } from "@convex-dev/react-query";
import { UserButton } from "@daveyplate/better-auth-ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useMatchRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
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

function ProjectSelector() {
  const { slug: selectedSlug } = useParams({ strict: false }) as { slug?: string };
  const navigate = useNavigate();

  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.listProjects, { organizationId: "seed" }),
  );

  return (
    <Select
      value={selectedSlug}
      onValueChange={(slug) =>
        navigate({ to: "/dashboard/$slug", params: { slug }, replace: true })
      }
    >
      <SelectTrigger className="w-40">
        <SelectValue placeholder="Select a project..." />
      </SelectTrigger>
      <SelectContent>
        {projects.map((project) => (
          <SelectItem key={project._id} value={project.slug}>
            {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DashboardNavbar() {
  return (
    <header className="border-b">
      <div className="flex h-14 items-center gap-4 px-6">
        <Link to="/">
          <img src="/logo-shape.svg" alt="camox logo" className="h-8 py-1" />
        </Link>
        <ProjectSelector />
        <div className="ml-auto">
          <UserButton size="icon" variant="ghost" />
        </div>
      </div>
    </header>
  );
}

function DashboardTabs() {
  const { slug: selectedSlug } = useParams({ strict: false }) as { slug?: string };
  const matchRoute = useMatchRoute();

  if (!selectedSlug) return null;

  const tabs = [
    { label: "Overview", to: "/dashboard/$slug" as const },
    { label: "Usage", to: "/dashboard/$slug" as const },
  ];

  return (
    <div className="border-b px-6">
      <nav className="-mb-px flex gap-4">
        {tabs.map((tab) => {
          const isActive =
            tab.label === "Overview" &&
            !!matchRoute({ to: tab.to, params: { slug: selectedSlug } });

          return (
            <Link
              key={tab.label}
              to={tab.to}
              params={{ slug: selectedSlug }}
              className={`border-b-2 px-1 py-3 text-sm font-medium ${
                isActive
                  ? "border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 border-transparent"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
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
          <DashboardTabs />
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </AwaitAuth>
      </Suspense>
    </div>
  );
}
