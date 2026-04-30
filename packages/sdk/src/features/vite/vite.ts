import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type Plugin, type ResolvedConfig, type ViteDevServer, createServer } from "vite";
import { z } from "zod";

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

const authTokenSchema = z.object({
  token: z.string(),
  name: z.string(),
  email: z.string(),
});
const authFileSchema = z.record(z.string(), authTokenSchema);

function readAuthEmail(authenticationUrl: string): string | null {
  const authFile = join(homedir(), ".camox", "auth.json");
  const key = authenticationUrl.replace(/\/+$/, "");
  try {
    const raw = JSON.parse(readFileSync(authFile, "utf-8"));
    const tokens = authFileSchema.parse(raw);
    return tokens[key]?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Drop a sidecar at `<root>/node_modules/.camox/runtime.json` so the `camox`
 * CLI can pick up the same projectSlug / apiUrl / authenticationUrl /
 * environmentName the plugin actually used. The CLI treats the vite config
 * as the source of truth — there is no other reliable way to recover these
 * values from outside vite.
 */
function writeRuntimeSidecar(
  root: string,
  data: {
    projectSlug: string;
    apiUrl: string;
    authenticationUrl: string;
    environmentName: string;
  },
): void {
  const dir = join(root, "node_modules", ".camox");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "runtime.json"), `${JSON.stringify(data, null, 2)}\n`);
}

function resolveEnvironmentName(command: "serve" | "build", authenticationUrl: string): string {
  if (command === "serve") {
    const email = readAuthEmail(authenticationUrl);
    if (!email) {
      throw new Error(
        "Camox: not authenticated. Run `npx camox login` to create your personal dev environment.",
      );
    }
    return `dev:${email}`;
  }

  const envFromProcess = process.env.CAMOX_ENV;
  if (envFromProcess) return envFromProcess;

  const email = readAuthEmail(authenticationUrl);
  const suggestion = email
    ? `  CAMOX_ENV=dev:${email}    (your personal dev environment)\n  CAMOX_ENV=production     (release build)`
    : `  CAMOX_ENV=production     (release build)\n\nIf you want to build against a dev environment, run \`npx camox login\` first.`;

  throw new Error(`Camox: CAMOX_ENV is required on build. Set it to one of:\n${suggestion}`);
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
      environmentName = resolveEnvironmentName(env.command, authenticationUrl);
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
            // React entries reached through `virtual:tanstack-start-client-entry`, which Vite's
            // scanner can't crawl — without these they're discovered at runtime, triggering a
            // re-optimize and 504 "Outdated Optimize Dep" errors on the in-flight requests.
            "react",
            "react-dom",
            "react-dom/client",
            "react/jsx-runtime",
            "react/jsx-dev-runtime",
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
            "camox > @camox/ui > lucide-react",
            "camox > lucide-react",
            // 3rd batch
            "camox > @tanstack/react-query-devtools/production",
            "camox > partysocket/react",
          ],
        },
      };
    },
    configResolved(config) {
      resolvedConfig = config;
      const routesDir = resolve(config.root, "src/routes");

      writeRuntimeSidecar(config.root, {
        projectSlug: options.projectSlug,
        apiUrl,
        authenticationUrl,
        environmentName,
      });

      if (!disableCodeGen) {
        generateAppFile(config.root);
        generateRouteFiles({
          routesDir,
          authenticationUrl,
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
          autoCreate: true,
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
          autoCreate: false,
          logger: resolvedConfig.logger,
        });
      } finally {
        await tempServer.close();
      }
    },
  };
}
