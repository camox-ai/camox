import { createFileRoute } from '@tanstack/react-router';
import { camoxApp } from '@/camox';

export const Route = createFileRoute('/_camox/og')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const layoutId = url.searchParams.get('layoutId') || '';
        const title = url.searchParams.get('title') || '';
        const description = url.searchParams.get('description') || '';
        const projectName = url.searchParams.get('projectName') || '';

        const layout = camoxApp.getLayoutById(layoutId);
        if (!layout?.buildOgImage) {
          return new Response('Not found', { status: 404 });
        }

        return layout.buildOgImage({ title, description, projectName });
      },
    },
  },
});
