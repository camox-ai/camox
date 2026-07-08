import {
  HydrationBoundary,
  QueryClientProvider,
  type DehydratedState,
  type QueryClient,
} from "@tanstack/react-query";

import type { CamoxApp } from "../../core/createApp";
import { CamoxContent } from "../content/CamoxContent";
import { CamoxProvider } from "../provider/CamoxProvider";
import { CamoxStudio } from "../studio/CamoxStudio";
import { STUDIO_CONTENT_PATH } from "../studio/routes";
import { StudioNavigationProvider } from "./studioNavigation";

export interface StudioRenderInput {
  apiUrl: string;
  authenticationUrl: string;
  dehydratedState: unknown;
  environmentName?: string;
  href: string;
  pathname: string;
  projectSlug: string;
  routeKind: "studio" | "studio-content" | "studio-nested";
  runtimeBasePath: string;
}

function StudioRouteContent({ input }: { input: StudioRenderInput }) {
  if (input.pathname === STUDIO_CONTENT_PATH) return <CamoxContent />;

  if (input.routeKind === "studio-nested") {
    return <div className="text-muted-foreground p-6 text-sm">Studio page not found</div>;
  }

  return <div className="text-muted-foreground p-6 text-sm">Loading Studio…</div>;
}

export function StudioApp({
  camoxApp,
  input,
  queryClient,
}: {
  camoxApp: CamoxApp;
  input: StudioRenderInput;
  queryClient: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={input.dehydratedState as DehydratedState}>
        <StudioNavigationProvider
          href={input.href}
          pathname={input.pathname}
          runtimeBasePath={input.runtimeBasePath}
        >
          <CamoxProvider
            camoxApp={camoxApp}
            authenticationUrl={input.authenticationUrl}
            apiUrl={input.apiUrl}
            projectSlug={input.projectSlug}
            environmentName={input.environmentName}
          >
            <CamoxStudio>
              <StudioRouteContent input={input} />
            </CamoxStudio>
          </CamoxProvider>
        </StudioNavigationProvider>
      </HydrationBoundary>
    </QueryClientProvider>
  );
}
