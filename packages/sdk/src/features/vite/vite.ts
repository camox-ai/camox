import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { type Plugin, type ResolvedConfig, type ViteDevServer, createServer } from "vite";

import { generateAppFile, watchAppFile } from "./appGeneration";
import { watchNewBlockFiles } from "./blockBoilerplate";

const PRODUCTION_API_URL = "https://api.camox.ai";
import { syncDefinitions, syncDefinitionsToApi } from "./definitionsSync";
import { generateRouteFiles, watchRouteFiles } from "./routeGeneration";
import { generateSkillFiles, watchSkillFiles } from "./skillGeneration";

/** Authentication URL to use for Camox authentication (production Camox web app) */
const DEFAULT_AUTHENTICATION_URL = "https://camox.ai";

function resolveEnvironmentName(isDev: boolean, authenticationUrl: string): string {
  if (!isDev) return "production";

  const authFile = join(homedir(), ".camox", "auth.json");
  const key = authenticationUrl.replace(/\/+$/, "");
  let auth: { email?: string } | undefined;
  try {
    const tokens = JSON.parse(readFileSync(authFile, "utf-8"));
    auth = tokens[key];
  } catch {
    throw new Error(
      `Camox: not authenticated for ${key}. Run \`camox login\` before starting the dev server.\n` +
        "Authentication is required so your dev environment is scoped to your user.",
    );
  }

  if (!auth?.email) {
    throw new Error(
      `Camox: no session found for ${key} in ~/.camox/auth.json. Run \`camox login\` again.`,
    );
  }

  const localPart = auth.email.split("@")[0];
  return `${localPart}-dev`;
}

export interface CamoxPluginOptions {
  /** Stable, human-readable slug identifying this project (e.g. "prestigious-impala-84") */
  projectSlug: string;
  /** Secret used to authenticate definition sync requests with the API */
  syncSecret: string;
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
    /** Disable automatic code generation (route files, app file, skill files) (default: false) */
    disableCodeGen?: boolean;
  };
}

export function camox(options: CamoxPluginOptions): Plugin {
  const apiUrl = options._internal?.apiUrl ?? PRODUCTION_API_URL;
  const authenticationUrl = options._internal?.authenticationUrl ?? DEFAULT_AUTHENTICATION_URL;
  const enableTanstackDevtools = options._internal?.enableTanstackDevtools ?? false;
  const disableCodeGen = options._internal?.disableCodeGen ?? false;

  let isBuild = false;
  let resolvedConfig: ResolvedConfig;
  let environmentName: string;

  return {
    name: "camox",
    config(_config, env) {
      isBuild = env.command === "build";
      environmentName = resolveEnvironmentName(env.command === "serve", authenticationUrl);
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
      if (!disableCodeGen) {
        generateAppFile(config.root);
        generateRouteFiles({
          routesDir,
          authenticationUrl,
          apiUrl,
          projectSlug: options.projectSlug,
          environmentName,
        });
        generateSkillFiles(config.root);
      }

      if (disableCodeGen) {
        config.logger.warn(
          "⚠️  Code generation is disabled (_internal.disableCodeGen). " +
            "This option is only meant for momentary debugging — " +
            "do not deploy or commit your app with it enabled.",
          { timestamp: true },
        );
      }

      const mode = config.command === "serve" ? "Running" : "Building";
      config.logger.info(`${mode} Camox app (environment: ${environmentName})`, {
        timestamp: true,
      });
    },

    configureServer(server: ViteDevServer) {
      const routesDir = resolve(server.config.root, "src/routes");
      if (!disableCodeGen) {
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
      }

      server.httpServer?.once("listening", () => {
        syncDefinitions(server, {
          projectSlug: options.projectSlug,
          syncSecret: options.syncSecret,
          apiUrl,
          environmentName,
        });
      });
    },

    async closeBundle() {
      if (!isBuild) return;

      const camoxAppPath = "./src/camox/app.ts";

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
