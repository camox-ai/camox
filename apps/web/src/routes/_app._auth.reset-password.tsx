import { AuthView } from "@daveyplate/better-auth-ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_auth/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  return <AuthView view="RESET_PASSWORD" />;
}
