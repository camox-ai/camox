import type { Database } from "../../db";
import type { Bindings } from "../../types";
import type { Auth } from "../auth/routes";

export type ServiceContext = {
  db: Database;
  user: Auth["$Infer"]["Session"]["user"] | null;
  env: Bindings;
  waitUntil: (promise: Promise<unknown>) => void;
  environmentName: string;
};
