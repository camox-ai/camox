import { createMiddleware } from "hono/factory";

import type { AppEnv } from "./types";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.var.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});
