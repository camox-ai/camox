import type { Router } from "@camox/api";
import { queryKeys } from "@camox/api/query-keys";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { QueryClient } from "@tanstack/react-query";
import { notFound } from "@tanstack/react-router";
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import type { CamoxApp } from "../../core/createApp";
import { trackEvent } from "../../lib/analytics";
import type { PageWithBlocks } from "../../lib/queries";
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

function createServerApiClient(apiUrl: string): RouterClient<Router> {
  return createORPCClient<RouterClient<Router>>(new RPCLink({ url: `${apiUrl}/rpc` }));
}

/* -------------------------------------------------------------------------------------------------
 * Server functions
 * -----------------------------------------------------------------------------------------------*/

export const getOrigin = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const url = new URL(request.url);
  return url.origin;
});

/* -------------------------------------------------------------------------------------------------
 * Factories
 * -----------------------------------------------------------------------------------------------*/

export function createMarkdownMiddleware(apiUrl: string) {
  const api = createServerApiClient(apiUrl);

  return createMiddleware().server(async ({ next, request }) => {
    const accept = request.headers.get("Accept") ?? "";
    if (prefersMarkdown(accept)) {
      const url = new URL(request.url);
      try {
        const page = await api.pages.getByPath({ path: url.pathname });
        const { markdown } = await api.blocks.getPageMarkdown({ pageId: page.page.id });
        if (markdown) {
          trackEvent("markdown_served", {
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

export function createPageLoader(apiUrl: string) {
  const serverApi = createServerApiClient(apiUrl);

  return async ({
    location,
    context,
  }: {
    location: { pathname: string };
    context: { queryClient: QueryClient };
  }) => {
    try {
      const [page, origin] = await Promise.all([
        context.queryClient.ensureQueryData({
          queryKey: queryKeys.pages.getByPath(location.pathname),
          queryFn: () => serverApi.pages.getByPath({ path: location.pathname }),
          staleTime: Infinity,
        }),
        getOrigin(),
      ]);
      return { page, origin };
    } catch {
      throw notFound();
    }
  };
}

export function createPageHead(camoxApp: CamoxApp) {
  return ({
    loaderData,
  }: {
    loaderData?: {
      page: PageWithBlocks;
      origin: string;
    };
  }) => {
    if (!loaderData) {
      return {};
    }

    const { page, origin } = loaderData;
    const pageMetaTitle = page.page.metaTitle ?? page.page.pathSegment;

    const meta: Array<Record<string, string>> = [];
    let title = pageMetaTitle;

    if (page.layout) {
      const layout = camoxApp.getLayoutById(page.layout.layoutId);
      if (layout) {
        title = layout.buildMetaTitle({
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
    const ogImageUrl = `${origin}/og?${ogImageParams.toString()}`;

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

    return { meta };
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
