import {
  HydrationBoundary,
  QueryClientProvider,
  type DehydratedState,
  type QueryClient,
} from "@tanstack/react-query";

import type { CamoxApp } from "../../core/createApp";
import { CamoxPreview, PageContent } from "../preview/CamoxPreview";
import { CamoxProvider } from "../provider/CamoxProvider";
import { PageNavigationProvider } from "./pageNavigation";
import type { PageRenderInput } from "./runtime";

export function PageApp({
  camoxApp,
  input,
  queryClient,
}: {
  camoxApp: CamoxApp;
  input: PageRenderInput;
  queryClient: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={input.dehydratedState as DehydratedState}>
        <PageNavigationProvider initialInput={input} queryClient={queryClient}>
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
        </PageNavigationProvider>
      </HydrationBoundary>
    </QueryClientProvider>
  );
}
