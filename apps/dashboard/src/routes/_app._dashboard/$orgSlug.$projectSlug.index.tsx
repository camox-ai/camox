import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_dashboard/$orgSlug/$projectSlug/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/$orgSlug/$projectSlug/overview",
      params: { orgSlug: params.orgSlug, projectSlug: params.projectSlug },
      replace: true,
    });
  },
});
