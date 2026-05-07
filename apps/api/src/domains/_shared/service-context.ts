import type { Database } from "../../db";
import type { Bindings } from "../../types";
import type { Auth } from "../auth/routes";

export type ServiceContext = {
  db: Database;
  user: Auth["$Infer"]["Session"]["user"] | null;
  env: Bindings;
  waitUntil: (promise: Promise<unknown>) => void;
  environmentName: string;
  /**
   * Free-form identifier for the calling client, set from the `X-Camox-Client`
   * request header. Known values: "studio", "cli", "mcp:<name>", "camox-agent",
   * or "unknown" when no header was sent. Used for analytics attribution.
   */
  client: string;
  /**
   * Honors the user's `disableAnalytics` vite plugin option. When true, the
   * server skips emission for events triggered by this request. Forwarded
   * through `X-Camox-Analytics-Disabled` from CLI and studio paths.
   */
  analyticsDisabled: boolean;
};
