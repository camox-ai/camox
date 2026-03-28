import { Hono } from "hono";

import { createDb } from "./db";
import { blockDefinitionRoutes } from "./features/block-definitions";
import { blockRoutes } from "./features/blocks";
import { fileRoutes } from "./features/files";
import { layoutRoutes } from "./features/layouts";
import { pageRoutes } from "./features/pages";
import { projectRoutes } from "./features/projects";
import { repeatableItemRoutes } from "./features/repeatable-items";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    c.set("db", createDb(c.env.DB));
    await next();
  })
  .route("/projects", projectRoutes)
  .route("/pages", pageRoutes)
  .route("/blocks", blockRoutes)
  .route("/layouts", layoutRoutes)
  .route("/files", fileRoutes)
  .route("/repeatable-items", repeatableItemRoutes)
  .route("/block-definitions", blockDefinitionRoutes);

export type AppType = typeof app;
export default app;
