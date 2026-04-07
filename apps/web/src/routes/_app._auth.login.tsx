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

  // Internal paths (e.g. /dashboard/cli-authorize): redirect there directly after login
  // via both redirectTo (email/password) and callbackURL (OAuth).
  // External URLs (e.g. SDK cross-domain auth): route through /dashboard?redirect=... so
  // _app.tsx's beforeLoad can generate an OTT before redirecting.
  const isInternalRedirect = redirect?.startsWith("/");
  const redirectTo = isInternalRedirect ? redirect : "/dashboard";

  let callbackURL: string | undefined;
  if (isInternalRedirect) {
    callbackURL = redirect;
  } else if (redirect) {
    callbackURL = `/dashboard?redirect=${encodeURIComponent(redirect)}`;
  }

  return <AuthView view="SIGN_IN" redirectTo={redirectTo} callbackURL={callbackURL} />;
}
