import type { Router } from "@camox/api";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { getAuthCookieHeader } from "./auth";

export type ApiClient = RouterClient<Router>;

let _client: ApiClient | null = null;
let _orpc: ReturnType<typeof createTanstackQueryUtils<ApiClient>> | null = null;
let _apiUrl: string | null = null;
let _environmentName: string | null = null;

export function initApiClient(apiUrl: string, environmentName?: string): ApiClient {
  _apiUrl = apiUrl;
  _environmentName = environmentName ?? null;

  const headers: Record<string, string> = {};
  if (environmentName) headers["x-environment-name"] = environmentName;

  const link = new RPCLink({
    url: `${apiUrl}/rpc`,
    headers,
    fetch: (request, init) => {
      if (request instanceof Request) {
        request.headers.set("Better-Auth-Cookie", getAuthCookieHeader());
      }
      return fetch(request, { ...init, credentials: "omit" });
    },
  });

  _client = createORPCClient<ApiClient>(link);
  _orpc = createTanstackQueryUtils(_client);
  return _client;
}

export function getApiClient(): ApiClient {
  if (!_client) throw new Error("API client not initialized — call initApiClient first");
  return _client;
}

export function getOrpc() {
  if (!_orpc) throw new Error("API client not initialized — call initApiClient first");
  return _orpc;
}

export function getApiUrl(): string {
  if (!_apiUrl) throw new Error("API client not initialized — call initApiClient first");
  return _apiUrl;
}

export function getEnvironmentName(): string | null {
  return _environmentName;
}
