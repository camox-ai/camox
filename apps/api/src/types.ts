/// <reference types="@cloudflare/workers-types" />
import type { Database } from "./db";
import type { Auth } from "./routes/auth";

export type Bindings = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SITE_URL: string;
  OPEN_ROUTER_API_KEY: string;
  AI_JOB_SCHEDULER: DurableObjectNamespace;
  ProjectRoom: DurableObjectNamespace;
  FILES_BUCKET: R2Bucket;
  SYNC_SECRET: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    db: Database;
    user: Auth["$Infer"]["Session"]["user"] | null;
    session: Auth["$Infer"]["Session"]["session"] | null;
    environmentName: string;
  };
};
