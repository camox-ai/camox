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
  return createMiddleware().server(async ({ next, request }) => {
    const accept = request.headers.get("Accept") ?? "";
    if (prefersMarkdown(accept)) {
      const url = new URL(request.url);
      const pageRes = await fetch(
        `${apiUrl}/pages/getByPath?${new URLSearchParams({ path: url.pathname })}`,
      );
      if (pageRes.ok) {
        const page = (await pageRes.json()) as PageWithBlocks;
        const mdRes = await fetch(
          `${apiUrl}/blocks/getPageMarkdown?${new URLSearchParams({ pageId: String(page.page.id) })}`,
        );
        if (mdRes.ok) {
          const { markdown } = (await mdRes.json()) as { markdown: string };
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
        }
      }
    }
    return next();
  });
}

export function createPageLoader(apiUrl: string) {
  return async ({ location }: { location: { pathname: string } }) => {
    const [pageRes, origin] = await Promise.all([
      fetch(`${apiUrl}/pages/getByPath?${new URLSearchParams({ path: location.pathname })}`),
      getOrigin(),
    ]);

    if (!pageRes.ok) {
      throw notFound();
    }

    const page = (await pageRes.json()) as PageWithBlocks;

    return { page, origin };
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

export const PageRouteComponent = ({ page }: { page: PageWithBlocks }) => {
  return (
    <CamoxPreview>
      <PageContent page={page} />
    </CamoxPreview>
  );
};
