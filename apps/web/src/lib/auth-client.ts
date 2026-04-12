import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { oneTimeTokenClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { SSR_COOKIE_NAME, crossDomainClient, parseCookieString } from "./cross-domain-client";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL!,
  plugins: [crossDomainClient(), organizationClient(), oneTimeTokenClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;

/**
 * SSR-safe session getter. Reads the mirrored same-site cookie written by the
 * cross-domain client plugin and forwards it to the API as the
 * `Better-Auth-Cookie` header — the same mechanism the client-side plugin uses.
 */
export const getServerSession = createServerFn({ method: "GET" }).handler(async () => {
  const cookieHeader = getRequestHeader("cookie") ?? "";

  // Look for the SSR mirror cookie set by the cross-domain client plugin.
  const match = cookieHeader.match(new RegExp(`${SSR_COOKIE_NAME}=([^;]+)`));
  const crossDomainData = match ? decodeURIComponent(match[1]) : null;

  if (crossDomainData) {
    const betterAuthCookie = parseCookieString(crossDomainData);
    if (betterAuthCookie.trim()) {
      const { data } = await authClient.getSession({
        fetchOptions: {
          headers: { "Better-Auth-Cookie": betterAuthCookie },
        },
      });
      return data;
    }
  }

  // Fallback: forward regular cookies (same-origin dev setup).
  const { data } = await authClient.getSession({
    fetchOptions: { headers: { cookie: cookieHeader } },
  });
  return data;
});
