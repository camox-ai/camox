import type { AppType } from "@camox/api";
import { hc } from "hono/client";

export type ApiClient = ReturnType<typeof hc<AppType>>;

let _client: ApiClient | null = null;

export function initApiClient(apiUrl: string): ApiClient {
  _client = hc<AppType>(apiUrl, {
    init: { credentials: "include" },
  });
  return _client;
}

export function getApiClient(): ApiClient {
  if (!_client) throw new Error("API client not initialized — call initApiClient first");
  return _client;
}
