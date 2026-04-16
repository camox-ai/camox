import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard/$orgSlug/$projectSlug/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/$orgSlug/$projectSlug/overview",
      params: { orgSlug: params.orgSlug, projectSlug: params.projectSlug },
      replace: true,
    });
  },
});
