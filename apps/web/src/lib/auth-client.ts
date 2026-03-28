import { oneTimeTokenClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL!,
  plugins: [organizationClient(), oneTimeTokenClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
