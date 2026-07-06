import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { TLSSocket } from "node:tls";
import { fileURLToPath } from "node:url";

import { type Plugin, type ViteDevServer, createServer } from "vite-plus";

import type { CamoxApp } from "../../core/createApp";
import { type FuturePageRenderInput, handleFutureCamoxRequest } from "../runtime/futureRuntime";

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const VIRTUAL_CAMOX_APP = "virtual:camox/app";
const RESOLVED_VIRTUAL_CAMOX_APP = "\0" + VIRTUAL_CAMOX_APP;
const VIRTUAL_FUTURE_PAGE_SERVER = "virtual:camox/future-page-server";
const RESOLVED_VIRTUAL_FUTURE_PAGE_SERVER = "\0" + VIRTUAL_FUTURE_PAGE_SERVER;
const VIRTUAL_FUTURE_PAGE_CLIENT = "virtual:camox/future-page-client";
const RESOLVED_VIRTUAL_FUTURE_PAGE_CLIENT = "\0" + VIRTUAL_FUTURE_PAGE_CLIENT;
const VIRTUAL_STUDIO_CSS = "virtual:camox-studio-css";
const RESOLVED_VIRTUAL_STUDIO_CSS = "\0" + VIRTUAL_STUDIO_CSS;
const VIRTUAL_OVERLAY_CSS = "virtual:camox-overlay-css";
const RESOLVED_VIRTUAL_OVERLAY_CSS = "\0" + VIRTUAL_OVERLAY_CSS;

interface FutureRuntimeDevOptions {
  apiUrl: string;
  authenticationUrl: string;
  disableTelemetry: boolean;
  environmentName: string;
  projectSlug: string;
}

function normalizeImporterPath(importer?: string): string {
  if (!importer) return "";
  const [path] = importer.split("?");
  if (path.startsWith("file://")) return fileURLToPath(path);
  if (path.startsWith("/@fs/")) return path.slice("/@fs".length);
  return path;
}

function resolveSdkAlias(id: string, importer?: string): string | undefined {
  if (!id.startsWith("@/")) return;

  const normalizedImporter = normalizeImporterPath(importer).replaceAll("\\", "/");
  const normalizedSdkSrc = resolve(sdkRoot, "src").replaceAll("\\", "/");
  if (!normalizedImporter.includes(`${normalizedSdkSrc}/`)) return;

  const basePath = resolve(sdkRoot, "src", id.slice(2));
  const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, resolve(basePath, "index.ts")];
  return candidates.find((candidate) => existsSync(candidate));
}

function resolveCamoxSourceImport(id: string): string | undefined {
  const sourceImports: Record<string, string> = {
    "camox/createApp": resolve(sdkRoot, "src/core/createApp.ts"),
    "camox/createBlock": resolve(sdkRoot, "src/core/createBlock.tsx"),
    "camox/createLayout": resolve(sdkRoot, "src/core/createLayout.tsx"),
    "camox/CamoxProvider": resolve(sdkRoot, "src/features/provider/CamoxProvider.tsx"),
    "camox/CamoxPreview": resolve(sdkRoot, "src/features/preview/CamoxPreview.tsx"),
    "camox/navigation": resolve(sdkRoot, "src/features/navigation/navigation.tsx"),
    "camox/_internal/futurePageServer": resolve(
      sdkRoot,
      "src/features/runtime/futurePageServer.tsx",
    ),
    "camox/_internal/futurePageClient": resolve(
      sdkRoot,
      "src/features/runtime/futurePageClient.tsx",
    ),
  };
  return sourceImports[id];
}

function generateVirtualCamoxApp(): string {
  return `import { createApp } from "camox/createApp";

const rootBlockModules = import.meta.glob("/src/blocks/*.{ts,tsx}", { eager: true });
const legacyBlockModules = import.meta.glob("/src/camox/blocks/*.{ts,tsx}", { eager: true });
const rootLayoutModules = import.meta.glob("/src/layouts/*.{ts,tsx}", { eager: true });
const legacyLayoutModules = import.meta.glob("/src/camox/layouts/*.{ts,tsx}", { eager: true });

const blocks = [...Object.values(rootBlockModules), ...Object.values(legacyBlockModules)]
  .map((mod) => mod.block)
  .filter(Boolean);
const layouts = [...Object.values(rootLayoutModules), ...Object.values(legacyLayoutModules)]
  .map((mod) => mod.layout)
  .filter(Boolean);

export const camoxApp = createApp({ blocks, layouts });
`;
}

function generateVirtualFuturePageServer(): string {
  return `import { renderFuturePageWithApp } from "camox/_internal/futurePageServer";
import { camoxApp } from "virtual:camox/app";

export async function renderFuturePage(input) {
  return renderFuturePageWithApp({ ...input, camoxApp });
}
`;
}

function generateVirtualFuturePageClient(): string {
  return `import { hydrateFuturePageWithApp } from "camox/_internal/futurePageClient";
import { camoxApp } from "virtual:camox/app";

hydrateFuturePageWithApp(camoxApp);
`;
}

function wrapViteDevId(id: string): string {
  return `/@id/${id.replace("\0", "__x00__")}`;
}

export function resolveFutureRuntimeDevId(id: string, importer?: string): string | undefined {
  const camoxSourceImport = resolveCamoxSourceImport(id);
  if (camoxSourceImport) return camoxSourceImport;

  const sdkAlias = resolveSdkAlias(id, importer);
  if (sdkAlias) return sdkAlias;

  if (id === VIRTUAL_CAMOX_APP) return RESOLVED_VIRTUAL_CAMOX_APP;
  if (id === VIRTUAL_FUTURE_PAGE_SERVER) return RESOLVED_VIRTUAL_FUTURE_PAGE_SERVER;
  if (id === VIRTUAL_FUTURE_PAGE_CLIENT) return RESOLVED_VIRTUAL_FUTURE_PAGE_CLIENT;
  if (id === VIRTUAL_STUDIO_CSS) return RESOLVED_VIRTUAL_STUDIO_CSS;
  if (id === VIRTUAL_OVERLAY_CSS) return RESOLVED_VIRTUAL_OVERLAY_CSS;
}

export function loadFutureRuntimeDevModule(id: string): string | undefined {
  if (id === RESOLVED_VIRTUAL_CAMOX_APP) return generateVirtualCamoxApp();
  if (id === RESOLVED_VIRTUAL_FUTURE_PAGE_SERVER) return generateVirtualFuturePageServer();
  if (id === RESOLVED_VIRTUAL_FUTURE_PAGE_CLIENT) return generateVirtualFuturePageClient();
  if (id === RESOLVED_VIRTUAL_STUDIO_CSS) {
    return `export default "/@fs/${resolve(sdkRoot, "dist/studio.css")}";`;
  }
  if (id === RESOLVED_VIRTUAL_OVERLAY_CSS) {
    return `export default ${JSON.stringify(readFileSync(resolve(sdkRoot, "dist/studio-overlays.css"), "utf-8"))};`;
  }
}

function createFutureRegistryPlugin(): Plugin {
  return {
    name: "camox-future-registry",
    enforce: "pre",
    resolveId: resolveFutureRuntimeDevId,
    load: loadFutureRuntimeDevModule,
  };
}

function getFutureTempServerConfig(server: ViteDevServer, options: FutureRuntimeDevOptions) {
  return {
    configFile: false as const,
    root: server.config.root,
    cacheDir: resolve(server.config.root, "node_modules", ".vite-camox-future"),
    define: {
      __CAMOX_TELEMETRY_DISABLED__: JSON.stringify(options.disableTelemetry),
      __ENABLE_TANSTACK_DEVTOOLS__: JSON.stringify(false),
      __CAMOX_ENVIRONMENT_NAME__: JSON.stringify(options.environmentName),
      __CAMOX_API_URL__: JSON.stringify(options.apiUrl),
      __CAMOX_PROJECT_SLUG__: JSON.stringify(options.projectSlug),
    },
    plugins: [createFutureRegistryPlugin()],
    resolve: server.config.resolve,
    server: { middlewareMode: true as const },
    logLevel: "silent" as const,
  };
}

async function withFutureTempServer<T>(
  server: ViteDevServer,
  options: FutureRuntimeDevOptions,
  callback: (tempServer: ViteDevServer) => Promise<T>,
): Promise<T> {
  const tempServer = await createServer(getFutureTempServerConfig(server, options));
  try {
    return await callback(tempServer);
  } finally {
    await tempServer.close();
  }
}

async function loadFutureCamoxApp(
  server: ViteDevServer,
  options: FutureRuntimeDevOptions,
): Promise<CamoxApp> {
  try {
    const module = (await server.ssrLoadModule(VIRTUAL_CAMOX_APP)) as { camoxApp: CamoxApp };
    return module.camoxApp;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("runnable environment")) throw error;
  }

  return withFutureTempServer(server, options, async (tempServer) => {
    const module = (await tempServer.ssrLoadModule(VIRTUAL_CAMOX_APP)) as { camoxApp: CamoxApp };
    return module.camoxApp;
  });
}

async function renderFuturePage(
  server: ViteDevServer,
  options: FutureRuntimeDevOptions,
  input: FuturePageRenderInput,
): Promise<string> {
  type FuturePageServerModule = {
    renderFuturePage: (input: FuturePageRenderInput) => Promise<string>;
  };

  try {
    const module = (await server.ssrLoadModule(
      VIRTUAL_FUTURE_PAGE_SERVER,
    )) as FuturePageServerModule;
    return module.renderFuturePage(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("runnable environment")) throw error;
  }

  return withFutureTempServer(server, options, async (tempServer) => {
    const module = (await tempServer.ssrLoadModule(
      VIRTUAL_FUTURE_PAGE_SERVER,
    )) as FuturePageServerModule;
    return module.renderFuturePage(input);
  });
}

function createRequestFromIncomingMessage(req: IncomingMessage): Request | null {
  if (!req.url) return null;

  const host = req.headers.host ?? "camox.local";
  const protocol = req.socket instanceof TLSSocket ? "https" : "http";
  const url = new URL(req.url, `${protocol}://${host}`);
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
      continue;
    }
    if (value) headers.set(name, value);
  }

  return new Request(url, { headers, method: req.method });
}

async function sendWebResponse(
  res: ServerResponse,
  response: Response,
  options: { transformHtml?: (html: string) => Promise<string> } = {},
): Promise<void> {
  res.statusCode = response.status;

  const headers = new Headers(response.headers);
  const contentType = headers.get("Content-Type") ?? headers.get("content-type") ?? "";
  let body = await response.text();
  if (contentType.includes("text/html") && options.transformHtml) {
    body = await options.transformHtml(body);
    headers.delete("Content-Length");
    headers.delete("content-length");
  }

  headers.forEach((value, name) => res.setHeader(name, value));
  res.end(body);
}

export function installFutureRuntimeDevMiddleware(
  server: ViteDevServer,
  options: FutureRuntimeDevOptions,
) {
  server.middlewares.use(async (req, res, next) => {
    const request = createRequestFromIncomingMessage(req);
    if (!request) {
      next();
      return;
    }

    const response = await handleFutureCamoxRequest(request, {
      apiUrl: options.apiUrl,
      authenticationUrl: options.authenticationUrl,
      clientEntryUrl: wrapViteDevId(RESOLVED_VIRTUAL_FUTURE_PAGE_CLIENT),
      environmentName: options.environmentName,
      getCamoxApp: () => loadFutureCamoxApp(server, options),
      projectSlug: options.projectSlug,
      renderPage: (input) => renderFuturePage(server, options, input),
    });
    if (!response) {
      next();
      return;
    }

    await sendWebResponse(res, response, {
      transformHtml: (html) => server.transformIndexHtml(req.url ?? "/_future/", html),
    });
  });
}
