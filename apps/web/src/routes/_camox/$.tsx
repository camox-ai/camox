import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { api } from "camox/_generated/api";
import { CamoxPreview, PageContent } from "camox/CamoxPreview";
import { camoxApp } from "@/camox";

const getOrigin = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const url = new URL(request.url);
  return url.origin;
});

export const Route = createFileRoute("/_camox/$")({
  component: App,
  loader: async ({ context, location }) => {
    const [page, origin] = await Promise.all([
      context.convexHttpClient.query(api.pages.getPage, {
        fullPath: location.pathname,
      }),
      getOrigin(),
    ]);

    if (!page) {
      throw notFound();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { page, origin } as any;
  },
  head: ({ loaderData }) => {
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
  },
});

function App() {
  const { page } = Route.useLoaderData();

  return (
    <CamoxPreview>
      <PageContent page={page} />
    </CamoxPreview>
  );
}
