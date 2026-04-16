import type { Router } from "@camox/api-contract";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

export type ServerApiClient = RouterClient<Router>;

export function createServerApiClient(apiUrl: string, environmentName?: string): ServerApiClient {
  const headers: Record<string, string> = {};
  if (environmentName) headers["x-environment-name"] = environmentName;
  const link = new RPCLink({ url: `${apiUrl}/rpc`, headers });
  return createORPCClient<ServerApiClient>(link);
}
