import { createFileRoute, notFound } from '@tanstack/react-router';
import { api } from 'camox/_generated/api';
import { CamoxPreview, PageContent } from 'camox/CamoxPreview';
import { camoxApp } from '@/camox';

export const Route = createFileRoute('/_camox/$')({
  component: App,
  loader: async ({ context, location }) => {
    const page = await context.convexHttpClient.query(api.pages.getPage, {
      fullPath: location.pathname,
    });

    if (!page) {
      throw notFound();
    }

    return { page };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {};
    }

    const { page } = loaderData;
    const pageMetaTitle = page.page.metaTitle ?? page.page.pathSegment;

    const meta: Array<Record<string, string>> = [];

    if (page.template) {
      const template = camoxApp.getTemplateById(page.template.templateId);
      if (template) {
        meta.push({
          title: template.buildMetaTitle({
            pageMetaTitle,
            projectName: page.projectName,
            pageFullPath: page.page.fullPath,
          }),
        });
      }
    }

    if (page.page.metaDescription) {
      meta.push({ name: 'description', content: page.page.metaDescription });
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
