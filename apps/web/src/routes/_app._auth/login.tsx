import { AuthView } from "@daveyplate/better-auth-ui";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/_app/_auth/login")({
  component: LoginPage,
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
});

function LoginPage() {
  const { redirect } = Route.useSearch();

  return <AuthView view="SIGN_IN" redirectTo={redirect ?? "/dashboard"} callbackURL={redirect} />;
}
