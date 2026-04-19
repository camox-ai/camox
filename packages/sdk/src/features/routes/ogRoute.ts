import type { CamoxApp } from "../../core/createApp";

export function createOgHandler(camoxApp: CamoxApp) {
  return {
    GET: async ({ request }: { request: Request }) => {
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
    },
  };
}
