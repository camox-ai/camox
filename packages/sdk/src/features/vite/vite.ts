import { resolve } from "node:path";

import type { Plugin, ViteDevServer } from "vite";

import { generateAppFile, watchAppFile } from "./appGeneration";
import { watchNewBlockFiles } from "./blockBoilerplate";
import {
  LOCAL_CONVEX_URL,
  LOCAL_CONVEX_SITE_URL,
  startConvexDev,
  stopConvexDev,
} from "./convexSync";
import { syncDefinitions, type DefinitionsSyncOptions } from "./definitionsSync";
import { generateRouteFiles, watchRouteFiles } from "./routeGeneration";
import { generateSkillFiles, watchSkillFiles } from "./skillGeneration";

/** Default management backend URL (production Camox web app) */
const DEFAULT_MANAGEMENT_URL = "https://camox.ai";

export interface CamoxPluginOptions {
  /** Stable, human-readable slug identifying this project (e.g. "prestigious-impala-84") */
  projectSlug: string;
  /** Disable the generation of boilerplate code when creating a blank file in the blocks directory (default: false) */
  disableBlockBoilerplateGeneration?: boolean;
  /** Disable automatic definitions sync on server start (default: false) */
  disableDefinitionsSync?: boolean;
  /** Options for definitions sync */
  definitionsSync?: DefinitionsSyncOptions;
  /** URL of the Camox management web app, used for authentication redirects */
  managementUrl?: string;
}

export function camox(options: CamoxPluginOptions): Plugin {
  const convexUrl = LOCAL_CONVEX_URL;
  const managementUrl = options.managementUrl ?? DEFAULT_MANAGEMENT_URL;

  return {
    name: "camox",
    config(_config, env) {
      if (env.command === "serve") {
        return {
          define: {
            "import.meta.env.VITE_CONVEX_URL": JSON.stringify(convexUrl),
            "import.meta.env.VITE_CONVEX_SITE_URL": JSON.stringify(LOCAL_CONVEX_SITE_URL),
          },
        };
      }
    },
    configResolved(config) {
      const routesDir = resolve(config.root, "src/routes");
      generateAppFile(config.root);
      generateRouteFiles(routesDir, convexUrl, managementUrl);
      generateSkillFiles(config.root);

      const message =
        config.command === "serve"
          ? `Running Camox app (NODE_ENV: ${process.env.NODE_ENV})`
          : `Building Camox app (NODE_ENV: ${process.env.NODE_ENV})`;
      config.logger.info(message, { timestamp: true });
    },

    configureServer(server: ViteDevServer) {
      const routesDir = resolve(server.config.root, "src/routes");
      watchAppFile(server, server.config.root);
      watchRouteFiles(server, routesDir, convexUrl, managementUrl);
      watchSkillFiles(server, server.config.root);

      if (!options.disableBlockBoilerplateGeneration) {
        watchNewBlockFiles(server);
      }

      // Start local Convex backend, then sync definitions once it's ready
      server.httpServer?.once("listening", async () => {
        await startConvexDev(server);

        // TODO: Set environment variables on the local deployment via
        // POST http://127.0.0.1:3210/update_environment_variables
        // so users don't have to manually run `npx convex env set` before the push succeeds.

        if (!options.disableDefinitionsSync) {
          syncDefinitions(server, {
            ...options.definitionsSync,
            projectSlug: options.projectSlug,
            convexUrl,
          });
        }
      });
    },

    buildEnd() {
      stopConvexDev();
    },
  };
}
