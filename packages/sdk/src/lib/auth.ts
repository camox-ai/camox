import { crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { oneTimeTokenClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as React from "react";

import { actionsStore } from "@/features/provider/actionsStore";

/* -------------------------------------------------------------------------------------------------
 * Auth client factory
 * -----------------------------------------------------------------------------------------------*/

export type CamoxAuthClient = ReturnType<typeof createCamoxAuthClient>;

export function createCamoxAuthClient(apiUrl: string) {
  return createAuthClient({
    baseURL: apiUrl,
    plugins: [crossDomainClient(), organizationClient(), oneTimeTokenClient()],
  });
}

/**
 * Process a `?ott=` one-time token from the URL before the provider mounts.
 * Verifies the token against the API backend and notifies the session store.
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

    // Strip ?ott= immediately so it's not processed again
    url.searchParams.delete("ott");
    window.history.replaceState({}, "", url);

    (async () => {
      try {
        await (authClient as any).oneTimeToken.verify({ token: ott });
        // crossDomainClient's fetch plugin handles storing the session cookie
        // in localStorage automatically. Just notify the session store.
        (authClient as any).updateSession?.();
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
  apiUrl: string;
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

export function useAuthState() {
  const { authClient } = useAuthContext();
  const { data: session, isPending } = (authClient as any).useSession();
  return {
    isAuthenticated: !!session,
    isLoading: isPending,
  };
}

export function useIsAuthenticated() {
  const { isAuthenticated } = useAuthState();
  return isAuthenticated;
}

/**
 * Stub — previously returned a Convex JWT for file uploads.
 * Returns null until file uploads are migrated to the new backend.
 */
export function useConvexToken() {
  return React.useCallback(async () => {
    return null;
  }, []);
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
