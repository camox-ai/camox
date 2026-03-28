import type { AppType } from "@camox/api";
import { hc, type InferResponseType } from "hono/client";

export const api = hc<AppType>(import.meta.env.VITE_API_URL!, {
  init: { credentials: "include" },
});

export type Project = InferResponseType<typeof api.projects.list.$get, 200>[number];
