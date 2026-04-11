import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const VIRTUAL_STUDIO_CSS = "virtual:camox-studio-css";
const RESOLVED_VIRTUAL_STUDIO_CSS = "\0" + VIRTUAL_STUDIO_CSS;

import { generateAppFile, watchAppFile } from "./appGeneration";
import { watchNewBlockFiles } from "./blockBoilerplate";

const PRODUCTION_API_URL = "https://api.camox.ai";
import {
  syncDefinitions,
  syncDefinitionsToApi,
  type DefinitionsSyncOptions,
} from "./definitionsSync";
import { generateRouteFiles, watchRouteFiles } from "./routeGeneration";
import { generateSkillFiles, watchSkillFiles } from "./skillGeneration";

/** Authentication URL to use for Camox authentication (production Camox web app) */
const DEFAULT_AUTHENTICATION_URL = "https://camox.ai";

function resolveEnvironmentName(isDev: boolean): string {
  if (!isDev) return "production";

  const authFile = join(homedir(), ".camox", "auth.json");
  let auth: { email?: string };
  try {
    auth = JSON.parse(readFileSync(authFile, "utf-8"));
  } catch {
    throw new Error(
      "Camox: not authenticated. Run `camox login` before starting the dev server.\n" +
        "Authentication is required so your dev environment is scoped to your user.",
    );
  }

  if (!auth.email) {
    throw new Error("Camox: ~/.camox/auth.json is missing an email. Run `camox login` again.");
  }

  const localPart = auth.email.split("@")[0];
  return `${localPart}-dev`;
}

export interface CamoxPluginOptions {
  /** Stable, human-readable slug identifying this project (e.g. "prestigious-impala-84") */
  projectSlug: string;
  /** Secret used to authenticate definition sync requests with the API */
  syncSecret: string;
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
  const apiUrl = options._internal?.apiUrl ?? PRODUCTION_API_URL;
  const authenticationUrl = options._internal?.authenticationUrl ?? DEFAULT_AUTHENTICATION_URL;
  const enableTanstackDevtools = options._internal?.enableTanstackDevtools ?? false;

  let isBuild = false;
  let resolvedConfig: ResolvedConfig;
  let environmentName: string;

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
      environmentName = resolveEnvironmentName(env.command === "serve");
      return {
        define: {
          __CAMOX_ANALYTICS_DISABLED__: JSON.stringify(!!options.disableAnalytics),
          __ENABLE_TANSTACK_DEVTOOLS__: JSON.stringify(enableTanstackDevtools),
          __CAMOX_ENVIRONMENT_NAME__: JSON.stringify(environmentName),
          __CAMOX_API_URL__: JSON.stringify(apiUrl),
          __CAMOX_PROJECT_SLUG__: JSON.stringify(options.projectSlug),
        },
      };
    },
    configResolved(config) {
      resolvedConfig = config;
      const routesDir = resolve(config.root, "src/routes");
      generateAppFile(config.root);
      generateRouteFiles({
        routesDir,
        authenticationUrl,
        apiUrl,
        projectSlug: options.projectSlug,
        environmentName,
      });
      generateSkillFiles(config.root);

      const mode = config.command === "serve" ? "Running" : "Building";
      config.logger.info(`${mode} Camox app (environment: ${environmentName})`, {
        timestamp: true,
      });
    },

    configureServer(server: ViteDevServer) {
      const routesDir = resolve(server.config.root, "src/routes");
      watchAppFile(server, server.config.root);
      watchRouteFiles({
        server,
        routesDir,
        authenticationUrl,
        apiUrl,
        projectSlug: options.projectSlug,
        environmentName,
      });
      watchSkillFiles(server, server.config.root);

      watchNewBlockFiles(server);

      server.httpServer?.once("listening", () => {
        syncDefinitions(server, {
          ...options.definitionsSync,
          projectSlug: options.projectSlug,
          syncSecret: options.syncSecret,
          apiUrl,
          environmentName,
        });
      });
    },

    async closeBundle() {
      if (!isBuild) return;

      const { createServer } = await import("vite");
      const camoxAppPath = options.definitionsSync?.camoxAppPath ?? "./src/camox/app.ts";

      const tempServer = await createServer({
        configFile: false,
        root: resolvedConfig.root,
        resolve: resolvedConfig.resolve,
        server: { middlewareMode: true },
        logLevel: "silent",
      });

      try {
        const camoxModule = (await tempServer.ssrLoadModule(camoxAppPath)) as {
          camoxApp?: import("@/core/createApp").CamoxApp;
        };

        if (!camoxModule.camoxApp) {
          throw new Error(`No camoxApp export found in ${camoxAppPath}`);
        }

        await syncDefinitionsToApi({
          camoxApp: camoxModule.camoxApp,
          projectSlug: options.projectSlug,
          apiUrl,
          syncSecret: options.syncSecret,
          environmentName,
          logger: resolvedConfig.logger,
        });
      } finally {
        await tempServer.close();
      }
    },
  };
}
