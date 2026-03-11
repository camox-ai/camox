import type { Plugin, ViteDevServer } from "vite";
import { resolve } from "node:path";
import { watchNewBlockFiles } from "./blockBoilerplate";
import {
  syncDefinitions,
  type DefinitionsSyncOptions,
} from "./definitionsSync";
import { startConvexDev, stopConvexDev } from "./convexSync";
import { generateAppFile, watchAppFile } from "./appGeneration";
import { generateRouteFiles, watchRouteFiles } from "./routeGeneration";
import { generateSkillFiles, watchSkillFiles } from "./skillGeneration";

export interface CamoxPluginOptions {
  /** Convex deploy key for non-interactive authentication (required) */
  convexDeployKey: string;
  /** Convex URL for the deployment (required) */
  convexUrl: string;
  /** Disable the generation of boilerplate code when creating a blank file in the blocks directory (default: false) */
  disableBlockBoilerplateGeneration?: boolean;
  /** Disable automatic definitions sync on server start (default: false) */
  disableDefinitionsSync?: boolean;
  /** Options for definitions sync */
  definitionsSync?: DefinitionsSyncOptions;
}

export function camox(options: CamoxPluginOptions): Plugin {
  return {
    name: "camox",
    configResolved(config) {
      const routesDir = resolve(config.root, "src/routes");
      generateAppFile(config.root);
      generateRouteFiles(routesDir, options.convexUrl);
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
      watchRouteFiles(server, routesDir, options.convexUrl);
      watchSkillFiles(server, server.config.root);

      if (!options.disableBlockBoilerplateGeneration) {
        watchNewBlockFiles(server);
      }

      startConvexDev({
        server,
        deployKey: options.convexDeployKey,
      });

      if (!options.disableDefinitionsSync) {
        // Sync after the server is ready to ensure modules can be loaded
        server.httpServer?.once("listening", () => {
          syncDefinitions(server, options.definitionsSync);
        });
      }
    },

    buildEnd() {
      stopConvexDev();
    },
  };
}
