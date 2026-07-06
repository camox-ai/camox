import {
  HydrationBoundary,
  QueryClientProvider,
  type DehydratedState,
  type QueryClient,
} from "@tanstack/react-query";

import type { CamoxApp } from "../../core/createApp";
import { CamoxPreview, PageContent } from "../preview/CamoxPreview";
import { CamoxProvider } from "../provider/CamoxProvider";
import { FuturePageNavigationProvider } from "./futurePageNavigation";
import type { FuturePageRenderInput } from "./futureRuntime";

export function FuturePageApp({
  camoxApp,
  input,
  queryClient,
}: {
  camoxApp: CamoxApp;
  input: FuturePageRenderInput;
  queryClient: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={input.dehydratedState as DehydratedState}>
        <FuturePageNavigationProvider initialInput={input} queryClient={queryClient}>
          <CamoxProvider
            camoxApp={camoxApp}
            authenticationUrl={input.authenticationUrl}
            apiUrl={input.apiUrl}
            projectSlug={input.projectSlug}
            environmentName={input.environmentName}
          >
            <CamoxPreview>
              <PageContent />
            </CamoxPreview>
          </CamoxProvider>
        </FuturePageNavigationProvider>
      </HydrationBoundary>
    </QueryClientProvider>
  );
}
