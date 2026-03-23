import { api } from "@camox/backend-management/_generated/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@camox/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@camox/ui/sidebar";
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
  useSearch,
} from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { SettingsIcon } from "lucide-react";
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

function SidebarProjectSelector() {
  const { project: selectedSlug } = useSearch({ strict: false }) as { project?: string };
  const navigate = useNavigate();

  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.listProjects, { organizationId: "seed" }),
  );

  return (
    <Select
      value={selectedSlug}
      onValueChange={(slug) =>
        navigate({ to: "/dashboard", search: { project: slug }, replace: true })
      }
    >
      <SelectTrigger className="w-full">
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

function AppSidebar() {
  const matchRoute = useMatchRoute();

  return (
    <Sidebar collapsible="none" className="sticky top-0 h-svh border-r">
      <SidebarHeader className="border-b">
        <Link to="/">
          <img src="/logo-long-dark.svg" alt="camox logo" className="h-10 py-2" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <div className="px-2 pt-2">
          <SidebarProjectSelector />
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarGroupLabel>Project</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={!!matchRoute({ to: "/dashboard" })}>
                  <Link to="/dashboard">
                    <SettingsIcon />
                    <span>Overview</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserButton size="sm" variant="ghost" />
      </SidebarFooter>
    </Sidebar>
  );
}

function DashboardLayout() {
  return (
    <SidebarProvider>
      <Toaster />
      <Suspense
        fallback={
          <main className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground">Loading…</p>
          </main>
        }
      >
        <AwaitAuth>
          <AppSidebar />
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </AwaitAuth>
      </Suspense>
    </SidebarProvider>
  );
}
