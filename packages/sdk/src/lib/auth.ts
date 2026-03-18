import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { oneTimeTokenClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { useConvexAuth } from "convex/react";
import * as React from "react";

import { actionsStore } from "@/features/provider/actionsStore";

/* -------------------------------------------------------------------------------------------------
 * Auth client factory
 * -----------------------------------------------------------------------------------------------*/

export type CamoxAuthClient = ReturnType<typeof createCamoxAuthClient>;

export function createCamoxAuthClient(managementUrl: string) {
  return createAuthClient({
    baseURL: `${managementUrl}/api/auth`,
    plugins: [convexClient(), crossDomainClient(), organizationClient(), oneTimeTokenClient()],
  });
}

/**
 * Process a `?ott=` one-time token from the URL before the ConvexBetterAuthProvider
 * mounts. Uses the standard `/one-time-token/verify` endpoint, then strips the
 * param so the provider doesn't attempt its own (cross-domain) verify.
 *
 * Returns `true` once processing is complete (or if there was no OTT).
 */
export function useProcessOtt(authClient: CamoxAuthClient) {
  const [ready, setReady] = React.useState(() => {
    if (typeof window === "undefined") return true;
    return !new URL(window.location.href).searchParams.has("ott");
  });

  React.useEffect(() => {
    if (ready) return;

    const url = new URL(window.location.href);
    const ott = url.searchParams.get("ott");
    if (!ott) {
      setReady(true);
      return;
    }

    // Strip ?ott= immediately so the provider never sees it
    url.searchParams.delete("ott");
    window.history.replaceState({}, "", url);

    (async () => {
      try {
        const result = await (authClient as any).oneTimeToken.verify({ token: ott });
        const session = result?.data?.session;
        if (session) {
          // Refresh session state so crossDomainClient stores the cookie
          await (authClient as any).getSession({
            fetchOptions: {
              headers: { Authorization: `Bearer ${session.token}` },
            },
          });
          (authClient as any).updateSession?.();
        }
      } catch {
        // OTT verification failed — continue unauthenticated
      }
      setReady(true);
    })();
  }, [authClient, ready]);

  return ready;
}

/* -------------------------------------------------------------------------------------------------
 * React context
 * -----------------------------------------------------------------------------------------------*/

interface AuthContextValue {
  authClient: CamoxAuthClient;
  managementUrl: string;
}

export const AuthContext = React.createContext<AuthContextValue | null>(null);

function useAuthContext() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("Missing CamoxProvider");
  return ctx;
}

/* -------------------------------------------------------------------------------------------------
 * Hooks
 * -----------------------------------------------------------------------------------------------*/

export function useIsAuthenticated() {
  const { isAuthenticated } = useConvexAuth();
  return isAuthenticated;
}

/**
 * Returns a function that fetches a fresh Convex JWT from the management backend.
 * Use this for Authorization headers on file upload requests.
 */
export function useConvexToken() {
  const { authClient } = useAuthContext();
  const { isAuthenticated } = useConvexAuth();

  return React.useCallback(async () => {
    if (!isAuthenticated) return null;
    const { data } = await (authClient as any).convex.token({
      fetchOptions: { throw: false },
    });
    return (data?.token as string) ?? null;
  }, [authClient, isAuthenticated]);
}

export function useSignInRedirect() {
  const { managementUrl } = useAuthContext();

  return React.useCallback(() => {
    const redirect = encodeURIComponent(window.location.href);
    window.location.href = `${managementUrl}/login?redirect=${redirect}`;
  }, [managementUrl]);
}

/**
 * Registers sign-out and manage-account actions in the command palette.
 */
export function useAuthActions() {
  const { authClient, managementUrl } = useAuthContext();

  React.useEffect(() => {
    actionsStore.send({
      type: "registerManyActions",
      actions: [
        {
          id: "manage-account",
          label: "Manage account",
          groupLabel: "Studio",
          checkIfAvailable: () => true,
          execute: () => {
            window.open(`${managementUrl}/profile`, "_blank");
          },
          icon: "User",
        },
        {
          id: "log-out",
          label: "Log out",
          groupLabel: "Studio",
          checkIfAvailable: () => true,
          execute: () => (authClient as any).signOut(),
          icon: "LogOut",
        },
      ],
    });

    return () => {
      actionsStore.send({
        type: "unregisterManyActions",
        ids: ["manage-account", "log-out"],
      });
    };
  }, [authClient, managementUrl]);
}
