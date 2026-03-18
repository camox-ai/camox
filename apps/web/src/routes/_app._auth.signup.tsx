import { AuthView } from "@daveyplate/better-auth-ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_auth/signup")({
  component: SignupPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
});

function SignupPage() {
  return <AuthView view="SIGN_UP" redirectTo="/dashboard" />;
}
