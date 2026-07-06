import { QueryClient, dehydrate } from "@tanstack/react-query";

import type { CamoxApp } from "../../core/createApp";
import {
  buildCamoxPageHead,
  createMarkdownResponse,
  createServerApiClient,
  isNotFoundError,
  loadCamoxPageForRequest,
} from "../routes/pageRuntime";

const FUTURE_RUNTIME_BASE_PATH = "/_future";
const FUTURE_RUNTIME_HEALTH_PATH = "/_camox/health";
const FUTURE_RUNTIME_REGISTRY_PATH = "/_camox/registry";
const SERVER_AUTH_COOKIE_NAME = "camox_auth_cookie";
const FUTURE_PUBLIC_BASE_PATH = "/_future";

export type FutureRuntimeRouteKind =
  | "data"
  | "health"
  | "og"
  | "page"
  | "registry"
  | "sitemap"
  | "studio"
  | "studio-content"
  | "studio-nested";

export interface FutureRuntimeRouteMatch {
  kind: FutureRuntimeRouteKind;
  pathname: string;
}

export interface FuturePageRenderInput {
  apiUrl: string;
  authenticationUrl: string;
  dehydratedState: unknown;
  environmentName?: string;
  head: unknown;
  href: string;
  loaderData: unknown;
  pathname: string;
  projectSlug: string;
}

export interface FutureRuntimeOptions {
  apiUrl?: string;
  authenticationUrl?: string;
  environmentName?: string;
  clientEntryUrl?: string;
  getCamoxApp?: () => Promise<CamoxApp>;
  projectSlug?: string;
  renderPage?: (input: FuturePageRenderInput) => Promise<string>;
}

function buildClearServerAuthCookieHeader() {
  return `${SERVER_AUTH_COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0`;
}

function getServerAuthCookieHeader(headers: Headers): string {
  const cookieHeader = headers.get("Cookie") ?? headers.get("cookie") ?? "";
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  const authCookie = cookies.find((part) => part.startsWith(`${SERVER_AUTH_COOKIE_NAME}=`));
  if (!authCookie) return "";

  const value = authCookie.slice(SERVER_AUTH_COOKIE_NAME.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

export function getFutureRuntimePathname(url: string): string | null {
  const { pathname } = new URL(url);
  if (pathname === FUTURE_RUNTIME_BASE_PATH) return "/";
  if (!pathname.startsWith(`${FUTURE_RUNTIME_BASE_PATH}/`)) return null;

  const stripped = pathname.slice(FUTURE_RUNTIME_BASE_PATH.length);
  return stripped || "/";
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizePagePath(path: string | null): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function matchFutureRuntimeRoute(pathname: string): FutureRuntimeRouteMatch {
  if (pathname === FUTURE_RUNTIME_HEALTH_PATH) return { kind: "health", pathname };
  if (pathname === FUTURE_RUNTIME_REGISTRY_PATH) return { kind: "registry", pathname };
  if (pathname === "/_camox/data") return { kind: "data", pathname };
  if (pathname === "/camox") return { kind: "studio", pathname };
  if (pathname === "/camox/content") return { kind: "studio-content", pathname };
  if (pathname.startsWith("/camox/")) return { kind: "studio-nested", pathname };
  if (pathname === "/og") return { kind: "og", pathname };
  if (pathname === "/sitemap.xml") return { kind: "sitemap", pathname };

  return { kind: "page", pathname };
}

async function createFutureSitemapResponse(
  request: Request,
  options: FutureRuntimeOptions,
): Promise<Response> {
  if (!options.apiUrl || !options.projectSlug) {
    return Response.json({ message: "Future Camox sitemap is not configured." }, { status: 500 });
  }

  const api = createServerApiClient(options.apiUrl, options.environmentName);
  const origin = new URL(request.url).origin;
  const pages = await api.pages.listBySlug({ projectSlug: options.projectSlug });
  const entries = pages
    .map(
      (page) => `  <url>
    <loc>${escapeXml(`${origin}${FUTURE_PUBLIC_BASE_PATH}${page.fullPath}`)}</loc>
    <lastmod>${escapeXml(new Date(page.updatedAt).toISOString())}</lastmod>
  </url>`,
    )
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}

async function createFutureOgResponse(
  request: Request,
  options: FutureRuntimeOptions,
): Promise<Response> {
  const camoxApp = await options.getCamoxApp?.();
  if (!camoxApp) {
    return Response.json(
      { message: "Future Camox app registry is not available." },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const layoutId = url.searchParams.get("layoutId") || "";
  const title = url.searchParams.get("title") || "";
  const description = url.searchParams.get("description") || "";
  const projectName = url.searchParams.get("projectName") || "";

  const layout = camoxApp.getLayoutById(layoutId);
  if (!layout?._internal.buildOgImage) {
    return new Response("Not found", { status: 404 });
  }

  return layout._internal.buildOgImage({ title, description, projectName });
}

function renderHeadTags(head: {
  meta?: Array<Record<string, string>>;
  links?: Array<Record<string, string>>;
}) {
  const meta = head.meta ?? [];
  const links = head.links ?? [];
  const title = meta.find((entry) => entry.title)?.title;
  const metaTags = meta
    .filter((entry) => !entry.title)
    .map((entry) => {
      const attrs = Object.entries(entry)
        .map(([key, value]) => `${key}="${escapeXml(value)}"`)
        .join(" ");
      return `<meta ${attrs}>`;
    })
    .join("\n");
  const linkTags = links
    .map((entry) => {
      const attrs = Object.entries(entry)
        .map(([key, value]) => `${key}="${escapeXml(value)}"`)
        .join(" ");
      return `<link ${attrs}>`;
    })
    .join("\n");

  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    title ? `<title>${escapeXml(title)}</title>` : "",
    metaTags,
    linkTags,
    '<link rel="stylesheet" href="/src/styles.css">',
  ]
    .filter(Boolean)
    .join("\n");
}

function serializeJsonForHtml(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function renderFutureClientEntryScript(src?: string): string {
  if (!src) return "";
  return `<script type="module" src="${escapeXml(src)}"></script>`;
}

async function createFuturePageHtmlResponse({
  options,
  pathname,
  request,
}: {
  options: FutureRuntimeOptions;
  pathname: string;
  request: Request;
}): Promise<Response> {
  if (
    !options.apiUrl ||
    !options.authenticationUrl ||
    !options.projectSlug ||
    !options.renderPage
  ) {
    return createFuturePageDataResponse({ options, pathname, request });
  }

  const queryClient = new QueryClient();
  try {
    const result = await loadCamoxPageForRequest({
      apiUrl: options.apiUrl,
      authCookieHeader: getServerAuthCookieHeader(request.headers),
      environmentName: options.environmentName,
      origin: new URL(request.url).origin,
      pathname,
      projectSlug: options.projectSlug,
      queryClient,
    });
    const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
    if (result.shouldClearAuthCookie) {
      headers.append("Set-Cookie", buildClearServerAuthCookieHeader());
    }

    const camoxApp = await options.getCamoxApp?.();
    const head = camoxApp ? buildCamoxPageHead(camoxApp, result.data) : {};
    const dehydratedState = dehydrate(queryClient);
    const pageRenderInput = {
      apiUrl: options.apiUrl,
      authenticationUrl: options.authenticationUrl,
      dehydratedState,
      environmentName: options.environmentName,
      head,
      href: new URL(request.url).href,
      loaderData: result.data,
      pathname,
      projectSlug: options.projectSlug,
    } satisfies FuturePageRenderInput;
    const appHtml = await options.renderPage(pageRenderInput);

    return new Response(
      `<!doctype html>
<html lang="en">
<head>
${renderHeadTags(head)}
<script id="__CAMOX_FUTURE_DATA__" type="application/json">${serializeJsonForHtml(pageRenderInput)}</script>
</head>
<body>
<div id="root">${appHtml}</div>
${renderFutureClientEntryScript(options.clientEntryUrl)}
</body>
</html>`,
      { headers },
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      return new Response("No Camox page on this path", { status: 404 });
    }
    throw error;
  }
}

async function createFuturePageDataResponse({
  options,
  pathname,
  request,
}: {
  options: FutureRuntimeOptions;
  pathname: string;
  request: Request;
}): Promise<Response> {
  if (!options.apiUrl || !options.projectSlug) {
    return Response.json(
      { message: "Future Camox page loader is not configured." },
      { status: 500 },
    );
  }

  const queryClient = new QueryClient();
  try {
    const result = await loadCamoxPageForRequest({
      apiUrl: options.apiUrl,
      authCookieHeader: getServerAuthCookieHeader(request.headers),
      environmentName: options.environmentName,
      origin: new URL(request.url).origin,
      pathname,
      projectSlug: options.projectSlug,
      queryClient,
    });
    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
    if (result.shouldClearAuthCookie) {
      headers.append("Set-Cookie", buildClearServerAuthCookieHeader());
    }

    const camoxApp = await options.getCamoxApp?.();
    const head = camoxApp ? buildCamoxPageHead(camoxApp, result.data) : null;
    const dehydratedState = dehydrate(queryClient);
    const { page, layout, projectName, project } = result.data.page;
    return new Response(
      `${JSON.stringify(
        {
          kind: "page",
          pathname,
          page: {
            id: page.id,
            fullPath: page.fullPath,
            metaTitle: page.metaTitle,
            metaDescription: page.metaDescription,
          },
          layout: layout ? { id: layout.id, layoutId: layout.layoutId } : null,
          project: { id: project.id, name: projectName },
          loaderData: {
            faviconUrl: result.data.faviconUrl,
            origin: result.data.origin,
          },
          head,
          dehydratedState,
        },
        null,
        2,
      )}\n`,
      { headers },
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      return Response.json(
        { kind: "page", message: "No Camox page on this path", pathname },
        { status: 404 },
      );
    }
    throw error;
  }
}

export async function handleFutureCamoxRequest(
  request: Request,
  options: FutureRuntimeOptions = {},
): Promise<Response | null> {
  const pathname = getFutureRuntimePathname(request.url);
  if (!pathname) return null;

  const match = matchFutureRuntimeRoute(pathname);
  if (match.kind === "health") {
    return new Response("ok\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (match.kind === "registry") {
    const camoxApp = await options.getCamoxApp?.();
    if (!camoxApp) {
      return Response.json(
        { message: "Future Camox app registry is not available." },
        { status: 500 },
      );
    }

    return Response.json({
      blocks: camoxApp.getBlocks().map((block) => block._internal.id),
      layouts: camoxApp.getLayouts().map((layout) => layout._internal.id),
    });
  }

  if (match.kind === "og") {
    return createFutureOgResponse(request, options);
  }

  if (match.kind === "sitemap") {
    return createFutureSitemapResponse(request, options);
  }

  if (match.kind === "data") {
    const url = new URL(request.url);
    return createFuturePageDataResponse({
      options,
      pathname: normalizePagePath(url.searchParams.get("path")),
      request,
    });
  }

  if (match.kind === "page") {
    if (options.apiUrl && options.projectSlug) {
      const markdownResponse = await createMarkdownResponse({
        apiUrl: options.apiUrl,
        environmentName: options.environmentName,
        pathname: match.pathname,
        projectSlug: options.projectSlug,
        request,
      });
      if (markdownResponse) return markdownResponse;
    }

    return createFuturePageHtmlResponse({ options, pathname: match.pathname, request });
  }

  return Response.json(
    {
      message: "Future Camox runtime route matched.",
      ...match,
    },
    { status: 501 },
  );
}
