import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type Plugin, type ResolvedConfig, type ViteDevServer, createServer } from "vite";

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const VIRTUAL_STUDIO_CSS = "virtual:camox-studio-css";
const RESOLVED_VIRTUAL_STUDIO_CSS = "\0" + VIRTUAL_STUDIO_CSS;
const VIRTUAL_OVERLAY_CSS = "virtual:camox-overlay-css";
const RESOLVED_VIRTUAL_OVERLAY_CSS = "\0" + VIRTUAL_OVERLAY_CSS;

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
    resolveId(id) {
      if (id === VIRTUAL_STUDIO_CSS) return RESOLVED_VIRTUAL_STUDIO_CSS;
      if (id === VIRTUAL_OVERLAY_CSS) return RESOLVED_VIRTUAL_OVERLAY_CSS;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_STUDIO_CSS) {
        const cssPath = resolve(sdkRoot, "dist/studio.css");
        if (isBuild) {
          const css = readFileSync(cssPath, "utf-8");
          const ref = this.emitFile({ type: "asset", name: "studio.css", source: css });
          return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
        }
        // Dev: serve the file directly via Vite's /@fs/ prefix
        return `export default "/@fs/${cssPath}";`;
      }
      if (id === RESOLVED_VIRTUAL_OVERLAY_CSS) {
        const cssPath = resolve(sdkRoot, "dist/studio-overlays.css");
        const css = readFileSync(cssPath, "utf-8");
        return `export default ${JSON.stringify(css)};`;
      }
    },
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
        optimizeDeps: {
          // When the Studio UI, loads dynamically at runtime, Vite discovers these dependencies in 3 batches,
          // each causing a page reload if they weren't included in either include or exclude.
          // All entries are prefixed with `camox >` because these packages are transitive
          // dependencies of the SDK — under pnpm's strict resolution they aren't resolvable
          // as bare specifiers from the user app's root. The `parent > child` form tells Vite
          // to resolve the nested dep through the parent package's own node_modules.
          include: [
            // 1st batch
            "camox > @base-ui/react/accordion",
            "camox > @base-ui/react/alert-dialog",
            "camox > @base-ui/react/avatar",
            "camox > @base-ui/react/dialog",
            "camox > @base-ui/react/input",
            "camox > @base-ui/react/menu",
            "camox > @base-ui/react/merge-props",
            "camox > @base-ui/react/popover",
            "camox > @base-ui/react/select",
            "camox > @base-ui/react/separator",
            "camox > @base-ui/react/switch",
            "camox > @base-ui/react/tabs",
            "camox > @base-ui/react/toggle",
            "camox > @base-ui/react/tooltip",
            "camox > @base-ui/react/use-render",
            // 2nd batch
            "camox > @dnd-kit/core",
            "camox > @dnd-kit/modifiers",
            "camox > @dnd-kit/sortable",
            "camox > @dnd-kit/utilities",
            "camox > @lexical/react/LexicalComposer",
            "camox > @lexical/react/LexicalComposerContext",
            "camox > @lexical/react/LexicalContentEditable",
            "camox > @lexical/react/LexicalOnChangePlugin",
            "camox > @lexical/react/LexicalRichTextPlugin",
            "camox > @orpc/client",
            "camox > @orpc/client/fetch",
            "camox > @orpc/tanstack-query",
            "camox > @sinclair/typebox",
            "camox > @takumi-rs/image-response",
            "camox > @tanstack/react-form",
            "camox > @xstate/store",
            "camox > @xstate/store/react",
            "camox > @camox/ui > cmdk",
            "camox > fractional-indexing",
            "camox > lexical",
            "camox > posthog-js",
            "camox > shiki",
            "camox > @camox/ui > sonner",
            // 3rd batch
            "camox > @tanstack/react-query-devtools/production",
            "camox > partysocket/react",
          ],
          exclude: ["virtual:tanstack-start-client-entry"],
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
