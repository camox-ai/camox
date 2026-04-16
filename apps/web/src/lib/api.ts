import type { Router } from "@camox/api-contract";
import { createORPCClient } from "@orpc/client";
import type { InferClientOutputs } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

const link = new RPCLink({
  url: `${import.meta.env.VITE_API_URL!}/rpc`,
  fetch: (request, init) => fetch(request, { ...init, credentials: "include" }),
});

export const api = createORPCClient<RouterClient<Router>>(link);

export type Project = InferClientOutputs<RouterClient<Router>>["projects"]["list"][number];
