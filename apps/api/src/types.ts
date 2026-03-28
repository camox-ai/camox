import type { Database } from "./db";

export type Bindings = {
  DB: D1Database;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    db: Database;
  };
};
