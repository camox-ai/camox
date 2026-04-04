import type { Router } from "@camox/api";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

export type ServerApiClient = RouterClient<Router>;

export function createServerApiClient(apiUrl: string, syncSecret?: string): ServerApiClient {
  const link = new RPCLink({
    url: `${apiUrl}/rpc`,
    headers: syncSecret ? { "x-sync-secret": syncSecret } : {},
  });
  return createORPCClient<ServerApiClient>(link);
}
