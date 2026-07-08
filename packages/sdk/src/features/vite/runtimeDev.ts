import { existsSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, normalize, resolve } from "node:path";
import { TLSSocket } from "node:tls";
import { fileURLToPath } from "node:url";

import { type Plugin, type ViteDevServer, createServer } from "vite-plus";

import type { CamoxApp } from "../../core/createApp";
import type { CamoxDocument } from "../../core/defineDocument";
import { type PageRenderInput, handleCamoxRequest } from "../runtime/runtime";
import type { StudioRenderInput } from "../runtime/studioApp";

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const VIRTUAL_CAMOX_APP = "virtual:camox/app";
const RESOLVED_VIRTUAL_CAMOX_APP = "\0" + VIRTUAL_CAMOX_APP;
const VIRTUAL_CAMOX_DOCUMENT = "virtual:camox/document";
const RESOLVED_VIRTUAL_CAMOX_DOCUMENT = "\0" + VIRTUAL_CAMOX_DOCUMENT;
const VIRTUAL_PAGE_SERVER = "virtual:camox/page-server";
const RESOLVED_VIRTUAL_PAGE_SERVER = "\0" + VIRTUAL_PAGE_SERVER;
const VIRTUAL_STUDIO_SERVER = "virtual:camox/studio-server";
const RESOLVED_VIRTUAL_STUDIO_SERVER = "\0" + VIRTUAL_STUDIO_SERVER;
const VIRTUAL_PAGE_CLIENT = "virtual:camox/page-client";
const RESOLVED_VIRTUAL_PAGE_CLIENT = "\0" + VIRTUAL_PAGE_CLIENT;
const VIRTUAL_STUDIO_CSS = "virtual:camox-studio-css";
const RESOLVED_VIRTUAL_STUDIO_CSS = "\0" + VIRTUAL_STUDIO_CSS;
const VIRTUAL_OVERLAY_CSS = "virtual:camox-overlay-css";
const RESOLVED_VIRTUAL_OVERLAY_CSS = "\0" + VIRTUAL_OVERLAY_CSS;

interface RuntimeDevOptions {
  apiUrl: string;
  authenticationUrl: string;
  disableTelemetry: boolean;
  environmentName: string;
  projectSlug: string;
  runtimeBasePath?: string;
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
    "camox/document": resolve(sdkRoot, "src/core/defineDocument.ts"),
    "camox/CamoxProvider": resolve(sdkRoot, "src/features/provider/CamoxProvider.tsx"),
    "camox/CamoxPreview": resolve(sdkRoot, "src/features/preview/CamoxPreview.tsx"),
    "camox/navigation": resolve(sdkRoot, "src/features/navigation/navigation.tsx"),
    "camox/_internal/pageServer": resolve(sdkRoot, "src/features/runtime/pageServer.tsx"),
    "camox/_internal/pageClient": resolve(sdkRoot, "src/features/runtime/pageClient.tsx"),
    "camox/_internal/studioServer": resolve(sdkRoot, "src/features/runtime/studioServer.tsx"),
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

function generateVirtualCamoxDocument(): string {
  return `const documentModules = import.meta.glob("/src/document.{ts,tsx}", { eager: true });
const documents = Object.values(documentModules)
  .map((mod) => mod.default)
  .filter(Boolean);

export const camoxDocument = documents[0] ?? {};
`;
}

function generateVirtualPageServer(): string {
  return `import { renderPageWithApp } from "camox/_internal/pageServer";
import { camoxApp } from "virtual:camox/app";

export async function renderPage(input) {
  return renderPageWithApp({ ...input, camoxApp });
}
`;
}

function generateVirtualStudioServer(): string {
  return `import { renderStudioWithApp } from "camox/_internal/studioServer";
import { camoxApp } from "virtual:camox/app";

export async function renderStudio(input) {
  return renderStudioWithApp({ ...input, camoxApp });
}
`;
}

function generateVirtualPageClient(): string {
  return `import { hydrateRuntimeWithApp } from "camox/_internal/pageClient";
import { camoxApp } from "virtual:camox/app";

hydrateRuntimeWithApp(camoxApp);
`;
}

function wrapViteDevId(id: string): string {
  return `/@id/${id.replace("\0", "__x00__")}`;
}

export function resolveRuntimeDevId(id: string, importer?: string): string | undefined {
  const camoxSourceImport = resolveCamoxSourceImport(id);
  if (camoxSourceImport) return camoxSourceImport;

  const sdkAlias = resolveSdkAlias(id, importer);
  if (sdkAlias) return sdkAlias;

  if (id === VIRTUAL_CAMOX_APP) return RESOLVED_VIRTUAL_CAMOX_APP;
  if (id === VIRTUAL_CAMOX_DOCUMENT) return RESOLVED_VIRTUAL_CAMOX_DOCUMENT;
  if (id === VIRTUAL_PAGE_SERVER) return RESOLVED_VIRTUAL_PAGE_SERVER;
  if (id === VIRTUAL_STUDIO_SERVER) return RESOLVED_VIRTUAL_STUDIO_SERVER;
  if (id === VIRTUAL_PAGE_CLIENT) return RESOLVED_VIRTUAL_PAGE_CLIENT;
  if (id === VIRTUAL_STUDIO_CSS) return RESOLVED_VIRTUAL_STUDIO_CSS;
  if (id === VIRTUAL_OVERLAY_CSS) return RESOLVED_VIRTUAL_OVERLAY_CSS;
}

export function loadRuntimeDevModule(id: string): string | undefined {
  if (id === RESOLVED_VIRTUAL_CAMOX_APP) return generateVirtualCamoxApp();
  if (id === RESOLVED_VIRTUAL_CAMOX_DOCUMENT) return generateVirtualCamoxDocument();
  if (id === RESOLVED_VIRTUAL_PAGE_SERVER) return generateVirtualPageServer();
  if (id === RESOLVED_VIRTUAL_STUDIO_SERVER) return generateVirtualStudioServer();
  if (id === RESOLVED_VIRTUAL_PAGE_CLIENT) return generateVirtualPageClient();
  if (id === RESOLVED_VIRTUAL_STUDIO_CSS) {
    return `export default "/@fs/${resolve(sdkRoot, "dist/studio.css")}";`;
  }
  if (id === RESOLVED_VIRTUAL_OVERLAY_CSS) {
    return `export default ${JSON.stringify(readFileSync(resolve(sdkRoot, "dist/studio-overlays.css"), "utf-8"))};`;
  }
}

function createRuntimeRegistryPlugin(): Plugin {
  return {
    name: "camox-runtime-registry",
    enforce: "pre",
    resolveId: resolveRuntimeDevId,
    load: loadRuntimeDevModule,
  };
}

function getRuntimeTempServerConfig(server: ViteDevServer, options: RuntimeDevOptions) {
  return {
    configFile: false as const,
    root: server.config.root,
    cacheDir: resolve(server.config.root, "node_modules", ".vite-camox-runtime"),
    define: {
      __CAMOX_TELEMETRY_DISABLED__: JSON.stringify(options.disableTelemetry),
      __ENABLE_TANSTACK_DEVTOOLS__: JSON.stringify(false),
      __CAMOX_ENVIRONMENT_NAME__: JSON.stringify(options.environmentName),
      __CAMOX_API_URL__: JSON.stringify(options.apiUrl),
      __CAMOX_PROJECT_SLUG__: JSON.stringify(options.projectSlug),
    },
    plugins: [createRuntimeRegistryPlugin()],
    resolve: server.config.resolve,
    server: { middlewareMode: true as const },
    logLevel: "silent" as const,
  };
}

async function withRuntimeTempServer<T>(
  server: ViteDevServer,
  options: RuntimeDevOptions,
  callback: (tempServer: ViteDevServer) => Promise<T>,
): Promise<T> {
  const tempServer = await createServer(getRuntimeTempServerConfig(server, options));
  try {
    return await callback(tempServer);
  } finally {
    await tempServer.close();
  }
}

async function loadCamoxDocument(
  server: ViteDevServer,
  options: RuntimeDevOptions,
): Promise<CamoxDocument> {
  type DocumentModule = { camoxDocument: CamoxDocument };

  try {
    const module = (await server.ssrLoadModule(VIRTUAL_CAMOX_DOCUMENT)) as DocumentModule;
    return module.camoxDocument;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("runnable environment")) throw error;
  }

  return withRuntimeTempServer(server, options, async (tempServer) => {
    const module = (await tempServer.ssrLoadModule(VIRTUAL_CAMOX_DOCUMENT)) as DocumentModule;
    return module.camoxDocument;
  });
}

async function loadCamoxApp(server: ViteDevServer, options: RuntimeDevOptions): Promise<CamoxApp> {
  try {
    const module = (await server.ssrLoadModule(VIRTUAL_CAMOX_APP)) as { camoxApp: CamoxApp };
    return module.camoxApp;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("runnable environment")) throw error;
  }

  return withRuntimeTempServer(server, options, async (tempServer) => {
    const module = (await tempServer.ssrLoadModule(VIRTUAL_CAMOX_APP)) as { camoxApp: CamoxApp };
    return module.camoxApp;
  });
}

async function renderPage(
  server: ViteDevServer,
  options: RuntimeDevOptions,
  input: PageRenderInput,
): Promise<string> {
  type PageServerModule = {
    renderPage: (input: PageRenderInput) => Promise<string>;
  };

  try {
    const module = (await server.ssrLoadModule(VIRTUAL_PAGE_SERVER)) as PageServerModule;
    return module.renderPage(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("runnable environment")) throw error;
  }

  return withRuntimeTempServer(server, options, async (tempServer) => {
    const module = (await tempServer.ssrLoadModule(VIRTUAL_PAGE_SERVER)) as PageServerModule;
    return module.renderPage(input);
  });
}

async function renderStudio(
  server: ViteDevServer,
  options: RuntimeDevOptions,
  input: StudioRenderInput,
): Promise<string> {
  type StudioServerModule = {
    renderStudio: (input: StudioRenderInput) => Promise<string>;
  };

  try {
    const module = (await server.ssrLoadModule(VIRTUAL_STUDIO_SERVER)) as StudioServerModule;
    return module.renderStudio(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("runnable environment")) throw error;
  }

  return withRuntimeTempServer(server, options, async (tempServer) => {
    const module = (await tempServer.ssrLoadModule(VIRTUAL_STUDIO_SERVER)) as StudioServerModule;
    return module.renderStudio(input);
  });
}

function normalizeRuntimeBasePath(basePath?: string): string {
  if (basePath === undefined) return "";
  if (!basePath || basePath === "/") return "";
  return basePath.startsWith("/")
    ? basePath.replace(/\/+$/, "")
    : `/${basePath.replace(/\/+$/, "")}`;
}

function isDocumentRequest(request: Request): boolean {
  const accept = request.headers.get("Accept") ?? request.headers.get("accept") ?? "";
  return accept.includes("text/html") || accept.includes("*/*");
}

function isPublicAssetRequest(pathname: string, server: ViteDevServer): boolean {
  if (!server.config.publicDir) return false;

  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  const publicDir = resolve(server.config.publicDir);
  const assetPath = resolve(publicDir, normalize(decodedPathname).replace(/^[/\\]+/, ""));
  if (assetPath === publicDir) return false;
  if (!assetPath.startsWith(`${publicDir}/`)) return false;
  if (!existsSync(assetPath)) return false;

  return statSync(assetPath).isFile();
}

function shouldHandleRuntimeDevRequest(
  request: Request,
  options: RuntimeDevOptions,
  server: ViteDevServer,
) {
  const url = new URL(request.url);
  const basePath = normalizeRuntimeBasePath(options.runtimeBasePath);
  if (basePath) return url.pathname === basePath || url.pathname.startsWith(`${basePath}/`);

  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (
    url.pathname === "/_camox/data" ||
    url.pathname === "/_camox/health" ||
    url.pathname === "/_camox/registry"
  ) {
    return true;
  }
  if (url.pathname === "/og" || url.pathname === "/sitemap.xml") return true;
  if (url.pathname === "/camox" || url.pathname.startsWith("/camox/")) return true;
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return false;
  if (url.pathname.startsWith("/@") || url.pathname.startsWith("/src/")) return false;
  if (url.pathname.startsWith("/__vite")) return false;
  if (url.pathname.startsWith("/node_modules/")) return false;
  if (isPublicAssetRequest(url.pathname, server)) return false;
  if (!isDocumentRequest(request)) return false;

  return true;
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

export function installRuntimeDevMiddleware(server: ViteDevServer, options: RuntimeDevOptions) {
  server.middlewares.use(async (req, res, next) => {
    const request = createRequestFromIncomingMessage(req);
    if (!request) {
      next();
      return;
    }

    if (!shouldHandleRuntimeDevRequest(request, options, server)) {
      next();
      return;
    }

    const response = await handleCamoxRequest(request, {
      apiUrl: options.apiUrl,
      authenticationUrl: options.authenticationUrl,
      clientEntryUrl: wrapViteDevId(RESOLVED_VIRTUAL_PAGE_CLIENT),
      environmentName: options.environmentName,
      getCamoxApp: () => loadCamoxApp(server, options),
      getDocument: () => loadCamoxDocument(server, options),
      projectSlug: options.projectSlug,
      renderPage: (input) => renderPage(server, options, input),
      renderStudio: (input) => renderStudio(server, options, input),
      runtimeBasePath: options.runtimeBasePath,
    });
    if (!response) {
      next();
      return;
    }

    await sendWebResponse(res, response, {
      transformHtml: (html) => server.transformIndexHtml(req.url ?? "/", html),
    });
  });
}
