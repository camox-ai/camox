import type { AppType } from "@camox/api";
import { hc } from "hono/client";
import * as React from "react";

export type ApiClient = ReturnType<typeof hc<AppType>>;

export function createApiClient(apiUrl: string): ApiClient {
  return hc<AppType>(apiUrl, {
    init: { credentials: "include" },
  });
}

export const ApiClientContext = React.createContext<ApiClient | null>(null);

export function useApiClient(): ApiClient {
  const client = React.useContext(ApiClientContext);
  if (!client) throw new Error("Missing CamoxProvider");
  return client;
}
