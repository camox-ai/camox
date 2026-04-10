import { AuthView } from "@daveyplate/better-auth-ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_auth/signup")({
  component: SignupPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
});

function SignupPage() {
  const { redirect } = Route.useSearch();

  // Internal paths (e.g. /cli-authorize): redirect there directly after signup
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

  return <AuthView view="SIGN_UP" redirectTo={redirectTo} callbackURL={callbackURL} />;
}
