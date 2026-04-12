import type { Router } from "@camox/api";
import { createORPCClient } from "@orpc/client";
import type { InferClientOutputs } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

import { parseCookieString } from "./cross-domain-client";

function getAuthCookie(): string {
  if (typeof window === "undefined") return "";
  return parseCookieString(localStorage.getItem("better-auth_cookie") || "{}");
}

const link = new RPCLink({
  url: `${import.meta.env.VITE_API_URL!}/rpc`,
  fetch: (request, init) => {
    if (request instanceof Request) {
      request.headers.set("Better-Auth-Cookie", getAuthCookie());
    }
    return fetch(request, { ...init, credentials: "omit" });
  },
});

export const api = createORPCClient<RouterClient<Router>>(link);

export type Project = InferClientOutputs<RouterClient<Router>>["projects"]["list"][number];
