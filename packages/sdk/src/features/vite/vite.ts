import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin, ViteDevServer } from "vite";

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const VIRTUAL_STUDIO_CSS = "virtual:camox-studio-css";
const RESOLVED_VIRTUAL_STUDIO_CSS = "\0" + VIRTUAL_STUDIO_CSS;

import { generateAppFile, watchAppFile } from "./appGeneration";
import { watchNewBlockFiles } from "./blockBoilerplate";

const LOCAL_API_URL = "http://localhost:8787";
import { syncDefinitions, type DefinitionsSyncOptions } from "./definitionsSync";
import { generateRouteFiles, watchRouteFiles } from "./routeGeneration";
import { generateSkillFiles, watchSkillFiles } from "./skillGeneration";

/** Authentication URL to use for Camox authentication (production Camox web app) */
const DEFAULT_AUTHENTICATION_URL = "https://camox.ai";

export interface CamoxPluginOptions {
  /** Stable, human-readable slug identifying this project (e.g. "prestigious-impala-84") */
  projectSlug: string;
  /** Options for definitions sync */
  definitionsSync?: DefinitionsSyncOptions;
  /** Disable PostHog analytics collection (default: false) */
  disableAnalytics?: boolean;
  /** Internal options (intended for Camox contributors in development, not for public use) */
  _internal?: {
    /** URL of the Camox API backend, used for data fetching */
    apiUrl?: string;
    /** URL of the Camox authentication backend (default: https://camox.ai) */
    authenticationUrl?: string;
    /** Show Tanstack query devtools (default: false) */
    enableTanstackDevtools?: boolean;
  };
}

export function camox(options: CamoxPluginOptions): Plugin {
  const apiUrl = options._internal?.apiUrl ?? LOCAL_API_URL;
  const authenticationUrl = options._internal?.authenticationUrl ?? DEFAULT_AUTHENTICATION_URL;
  const enableTanstackDevtools = options._internal?.enableTanstackDevtools ?? false;

  let isBuild = false;

  return {
    name: "camox",
    resolveId(id) {
      if (id === VIRTUAL_STUDIO_CSS) return RESOLVED_VIRTUAL_STUDIO_CSS;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_STUDIO_CSS) return;
      const cssPath = resolve(sdkRoot, "dist/studio.css");
      if (isBuild) {
        const css = readFileSync(cssPath, "utf-8");
        const ref = this.emitFile({ type: "asset", name: "studio.css", source: css });
        return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
      }
      // Dev: serve the file directly via Vite's /@fs/ prefix
      return `export default "/@fs/${cssPath}";`;
    },
    config(_config, env) {
      isBuild = env.command === "build";
      return {
        define: {
          __CAMOX_ANALYTICS_DISABLED__: JSON.stringify(!!options.disableAnalytics),
          __ENABLE_TANSTACK_DEVTOOLS__: JSON.stringify(enableTanstackDevtools),
        },
      };
    },
    configResolved(config) {
      const routesDir = resolve(config.root, "src/routes");
      generateAppFile(config.root);
      generateRouteFiles({
        routesDir,
        authenticationUrl,
        apiUrl,
      });
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
      watchRouteFiles({ server, routesDir, authenticationUrl, apiUrl });
      watchSkillFiles(server, server.config.root);

      watchNewBlockFiles(server);

      server.httpServer?.once("listening", () => {
        syncDefinitions(server, {
          ...options.definitionsSync,
          projectSlug: options.projectSlug,
          apiUrl,
        });
      });
    },
  };
}
