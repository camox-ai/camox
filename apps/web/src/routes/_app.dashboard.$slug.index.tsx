import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard/$slug/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/$slug/overview",
      params: { slug: params.slug },
      replace: true,
    });
  },
});
