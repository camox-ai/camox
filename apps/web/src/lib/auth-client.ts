import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { oneTimeTokenClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [convexClient(), crossDomainClient(), organizationClient(), oneTimeTokenClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
