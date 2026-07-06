import {
  HydrationBoundary,
  QueryClientProvider,
  type DehydratedState,
  type QueryClient,
} from "@tanstack/react-query";

import type { CamoxApp } from "../../core/createApp";
import { NavigationProvider } from "../navigation/navigation";
import { CamoxPreview, PageContent } from "../preview/CamoxPreview";
import { CamoxProvider } from "../provider/CamoxProvider";
import type { FuturePageRenderInput } from "./futureRuntime";

function getInitialLocation(input: FuturePageRenderInput) {
  const url = new URL(input.href);
  return {
    hash: url.hash,
    href: input.href,
    pathname: input.pathname,
    search: url.search,
  };
}

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
        <NavigationProvider initialLocation={getInitialLocation(input)}>
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
        </NavigationProvider>
      </HydrationBoundary>
    </QueryClientProvider>
  );
}
