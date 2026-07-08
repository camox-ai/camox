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
import { FutureStudioNavigationProvider } from "./futureStudioNavigation";

export interface FutureStudioRenderInput {
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

function FutureStudioRouteContent({ input }: { input: FutureStudioRenderInput }) {
  if (input.pathname === STUDIO_CONTENT_PATH) return <CamoxContent />;

  if (input.routeKind === "studio-nested") {
    return <div className="text-muted-foreground p-6 text-sm">Studio page not found</div>;
  }

  return <div className="text-muted-foreground p-6 text-sm">Loading Studio…</div>;
}

export function FutureStudioApp({
  camoxApp,
  input,
  queryClient,
}: {
  camoxApp: CamoxApp;
  input: FutureStudioRenderInput;
  queryClient: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={input.dehydratedState as DehydratedState}>
        <FutureStudioNavigationProvider
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
              <FutureStudioRouteContent input={input} />
            </CamoxStudio>
          </CamoxProvider>
        </FutureStudioNavigationProvider>
      </HydrationBoundary>
    </QueryClientProvider>
  );
}
