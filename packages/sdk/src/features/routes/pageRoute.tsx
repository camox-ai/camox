import type { Router } from "@camox/api-contract";
import { queryKeys } from "@camox/api-contract/query-keys";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { QueryClient } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import { createMiddleware, createServerFn } from "@tanstack/react-start";

import type { CamoxApp } from "../../core/createApp";
import {
  buildClearServerAuthCookieHeader,
  getAuthCookieHeader,
  getServerAuthCookieHeader,
} from "../../lib/auth";
import { seedBlockCaches } from "../../lib/normalized-data";
import type { PageStructure } from "../../lib/queries";
import { trackEvent } from "../../lib/telemetry";
import { CamoxPreview, PageContent } from "../preview/CamoxPreview";

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

export function parseQuality(part: string): number {
  const match = part.match(/;\s*q=([0-9.]+)/);
  return match ? parseFloat(match[1]) : 1;
}

export function prefersMarkdown(accept: string): boolean {
  let markdownQ = -1;
  let htmlQ = -1;
  for (const part of accept.split(",")) {
    const trimmed = part.trim();
    if (trimmed.startsWith("text/markdown")) {
      markdownQ = parseQuality(trimmed);
    } else if (trimmed.startsWith("text/html")) {
      htmlQ = parseQuality(trimmed);
    }
  }
  return markdownQ > 0 && markdownQ >= htmlQ;
}

function createServerApiClient(
  apiUrl: string,
  environmentName?: string,
  options?: { authCookieHeader?: string },
): RouterClient<Router> {
  const headers: Record<string, string> = {};
  if (environmentName) headers["x-environment-name"] = environmentName;
  return createORPCClient<RouterClient<Router>>(
    new RPCLink({
      url: `${apiUrl}/rpc`,
      headers,
      fetch: (request, init) => {
        if (options?.authCookieHeader && request instanceof Request) {
          request.headers.set("Better-Auth-Cookie", options.authCookieHeader);
        }
        return fetch(request, init);
      },
    }),
  );
}

type PageSource = "draft" | "live";

interface LoadPageOptions {
  apiUrl: string;
  authCookieHeader?: string;
  context: { queryClient: QueryClient };
  environmentName?: string;
  pathname: string;
  projectSlug: string;
  source: PageSource;
}

interface ErrorDetails {
  code?: string;
  status?: number;
  message: string;
}

function getErrorDetails(error: unknown): ErrorDetails {
  if (!error || typeof error !== "object") {
    return { message: String(error) };
  }

  const errorRecord = error as Record<string, unknown>;
  return {
    code: typeof errorRecord.code === "string" ? errorRecord.code : undefined,
    status: typeof errorRecord.status === "number" ? errorRecord.status : undefined,
    message:
      error instanceof Error
        ? error.message
        : typeof errorRecord.message === "string"
          ? errorRecord.message
          : "",
  };
}

function isAuthSessionError(error: unknown): boolean {
  const { code, status, message } = getErrorDetails(error);
  if (code === "UNAUTHORIZED" || code === "FORBIDDEN") return true;
  if (status === 401 || status === 403) return true;

  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("forbidden") ||
    lowerMessage.includes("invalid session") ||
    lowerMessage.includes("session expired") ||
    lowerMessage.includes("expired session")
  );
}

function isNotFoundError(error: unknown): boolean {
  const { code, status } = getErrorDetails(error);
  return code === "NOT_FOUND" || status === 404;
}

async function clearServerAuthCookie() {
  if (typeof window !== "undefined") return;
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Set-Cookie", buildClearServerAuthCookieHeader());
}

async function loadPage({
  apiUrl,
  authCookieHeader,
  context,
  environmentName,
  pathname,
  projectSlug,
  source,
}: LoadPageOptions): Promise<PageStructure> {
  const serverApi = createServerApiClient(apiUrl, environmentName, { authCookieHeader });
  return context.queryClient.ensureQueryData({
    queryKey: queryKeys.pages.getByPath(pathname, source),
    queryFn: async () => {
      const [data, pagesList] = await Promise.all([
        // Public visitors read from the live (published) snapshot.
        // Authenticated studio navigation reads the draft so newly
        // created, unpublished pages can mount their editing UI.
        serverApi.pages.getByPath({
          path: pathname,
          projectSlug,
          source,
        }),
        serverApi.pages.listBySlug({ projectSlug }).catch(() => null),
      ]);
      seedBlockCaches(context.queryClient, data, source);
      context.queryClient.setQueryData(queryKeys.pages.getByPath(pathname, source), {
        page: data.page,
        layout: data.layout,
        projectName: data.projectName,
        project: data.project,
      });
      if (source === "live") {
        // Public visitors render through the preview store's default
        // draft slot, but they should only ever see published content.
        seedBlockCaches(context.queryClient, data, "draft");
        context.queryClient.setQueryData(queryKeys.pages.getByPath(pathname, "draft"), {
          page: data.page,
          layout: data.layout,
          projectName: data.projectName,
          project: data.project,
        });
      }
      if (pagesList) {
        context.queryClient.setQueryData(queryKeys.pages.list, pagesList);
      }
      return {
        page: data.page,
        layout: data.layout,
        projectName: data.projectName,
        project: data.project,
      };
    },
    staleTime: Infinity,
  });
}

function throwNotFoundOrRethrow(error: unknown): never {
  if (isNotFoundError(error)) throw notFound();
  throw error;
}

async function loadLivePage(
  options: Omit<LoadPageOptions, "authCookieHeader" | "source">,
): Promise<PageStructure> {
  try {
    return await loadPage({ ...options, source: "live" });
  } catch (error) {
    throwNotFoundOrRethrow(error);
  }
}

async function buildLoaderData(apiUrl: string, page: PageStructure) {
  const origin = await getOrigin();
  // Built here (not in the head factory) so the API URL stays a loader
  // closure detail — the head function reads it straight from loaderData.
  const faviconUrl = `${apiUrl}/favicons/${page.project.id}?v=${page.project.updatedAt}`;
  return { page, origin, faviconUrl };
}

/* -------------------------------------------------------------------------------------------------
 * Server functions
 * -----------------------------------------------------------------------------------------------*/

export const getOrigin = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  const url = new URL(request.url);
  return url.origin;
});

export const getServerLoaderAuthCookieHeader = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getRequest } = await import("@tanstack/react-start/server");
    return getServerAuthCookieHeader(getRequest().headers);
  },
);

/* -------------------------------------------------------------------------------------------------
 * Factories
 * -----------------------------------------------------------------------------------------------*/

export function createMarkdownMiddleware(
  apiUrl: string,
  projectSlug: string,
  environmentName?: string,
) {
  const api = createServerApiClient(apiUrl, environmentName);

  return createMiddleware().server(async ({ next, request }) => {
    const accept = request.headers.get("Accept") ?? "";
    if (prefersMarkdown(accept)) {
      const url = new URL(request.url);
      try {
        const page = await api.pages.getByPath({ path: url.pathname, projectSlug, source: "live" });
        const { markdown } = await api.blocks.getPageMarkdown({ pageId: page.page.id });
        if (markdown) {
          void trackEvent("markdown_served", {
            pathname: url.pathname,
            projectId: page.page.projectId,
            projectName: page.projectName,
          });
          throw new Response(markdown, {
            headers: { "Content-Type": "text/markdown; charset=utf-8" },
          });
        }
      } catch (e) {
        // Re-throw Response objects (markdown response), ignore oRPC errors (page not found)
        if (e instanceof Response) throw e;
      }
    }
    return next();
  });
}

export function createPageLoader(apiUrl: string, projectSlug: string, environmentName?: string) {
  return async ({
    location,
    context,
  }: {
    location: { pathname: string };
    context: { queryClient: QueryClient };
  }) => {
    const authCookieHeader =
      typeof window !== "undefined"
        ? getAuthCookieHeader()
        : await getServerLoaderAuthCookieHeader();
    const loadOptions = {
      apiUrl,
      context,
      environmentName,
      pathname: location.pathname,
      projectSlug,
    };

    if (!authCookieHeader) {
      const page = await loadLivePage(loadOptions);
      return buildLoaderData(apiUrl, page);
    }

    try {
      const page = await loadPage({ ...loadOptions, authCookieHeader, source: "draft" });
      return buildLoaderData(apiUrl, page);
    } catch (error) {
      if (!isAuthSessionError(error)) {
        throwNotFoundOrRethrow(error);
      }

      await clearServerAuthCookie();
      console.warn("[camox] Ignoring stale camox_auth_cookie and retrying published page load.");

      const page = await loadLivePage(loadOptions);
      return buildLoaderData(apiUrl, page);
    }
  };
}

export function createPageHead(camoxApp: CamoxApp) {
  return ({
    loaderData,
  }: {
    loaderData?: {
      page: PageStructure;
      origin: string;
      faviconUrl: string;
    };
  }) => {
    if (!loaderData) {
      return {};
    }

    const { page, origin, faviconUrl } = loaderData;
    const pageMetaTitle = page.page.metaTitle ?? page.page.pathSegment;

    const meta: Array<Record<string, string>> = [];
    let title = pageMetaTitle;

    if (page.layout) {
      const layout = camoxApp.getLayoutById(page.layout.layoutId);
      if (layout) {
        title = layout._internal.buildMetaTitle({
          pageMetaTitle,
          projectName: page.projectName,
          pageFullPath: page.page.fullPath,
        });
        meta.push({ title });
      }
    }

    if (page.page.metaDescription) {
      meta.push({ name: "description", content: page.page.metaDescription });
    }

    const ogImageParams = new URLSearchParams({
      ...(page.layout && { layoutId: page.layout.layoutId }),
      title: pageMetaTitle,
      ...(page.page.metaDescription && {
        description: page.page.metaDescription,
      }),
      ...(page.projectName && { projectName: page.projectName }),
    });
    const ogImageUrl = page.page.customOgImageUrl ?? `${origin}/og?${ogImageParams.toString()}`;

    meta.push(
      { property: "og:title", content: title },
      { property: "og:image", content: ogImageUrl },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
    );

    if (page.page.metaDescription) {
      meta.push({
        property: "og:description",
        content: page.page.metaDescription,
      });
    }

    // Cache-busted via `?v=${project.updatedAt}` (set by the loader). When the
    // project has no favicon uploaded, the request 404s and the browser falls
    // back to whatever the user's root template declares.
    return {
      meta,
      links: [{ rel: "icon", href: faviconUrl }],
    };
  };
}

/* -------------------------------------------------------------------------------------------------
 * Component
 * -----------------------------------------------------------------------------------------------*/

export const PageRouteComponent = () => {
  return (
    <CamoxPreview>
      <PageContent />
    </CamoxPreview>
  );
};
