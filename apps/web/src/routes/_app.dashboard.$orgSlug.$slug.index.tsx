import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard/$orgSlug/$slug/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/$orgSlug/$slug/overview",
      params: { orgSlug: params.orgSlug, slug: params.slug },
      replace: true,
    });
  },
});
