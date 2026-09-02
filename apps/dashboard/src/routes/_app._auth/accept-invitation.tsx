import { AuthView } from "@daveyplate/better-auth-ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_auth/accept-invitation")({
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  return <AuthView view="ACCEPT_INVITATION" />;
}
