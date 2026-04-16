import { Tabs, TabsList, TabsTrigger } from "@camox/ui/tabs";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";

import { projectQueries } from "@/lib/queries";

export const Route = createFileRoute("/_app/dashboard/$orgSlug/$slug")({
  component: RouteComponent,
});

function RouteComponent() {
  const { orgSlug, slug } = Route.useParams();
  const matchRoute = useMatchRoute();

  const { data: project } = useSuspenseQuery(projectQueries.getBySlug(slug));

  if (!project) return null;

  const isUsage = matchRoute({ to: "/dashboard/$orgSlug/$slug/usage", params: { orgSlug, slug } });
  const activeTab = isUsage ? "usage" : "overview";

  return (
    <div>
      <div className="px-6 py-6">
        <Tabs value={activeTab} className="mx-auto max-w-4xl">
          <TabsList>
            <TabsTrigger
              value="overview"
              nativeButton={false}
              render={<Link to="/dashboard/$orgSlug/$slug/overview" params={{ orgSlug, slug }} />}
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="usage"
              nativeButton={false}
              render={<Link to="/dashboard/$orgSlug/$slug/usage" params={{ orgSlug, slug }} />}
            >
              Usage
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Outlet />
    </div>
  );
}
