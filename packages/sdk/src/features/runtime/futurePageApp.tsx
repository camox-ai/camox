import {
  HydrationBoundary,
  QueryClientProvider,
  type DehydratedState,
  type QueryClient,
} from "@tanstack/react-query";

import type { CamoxApp } from "../../core/createApp";
import { initApiClient } from "../../lib/api-client";
import { AuthContext } from "../../lib/auth";
import { NavigationProvider } from "../navigation/navigation";
import { CamoxPreview, PageContent } from "../preview/CamoxPreview";
import { CamoxAppProvider } from "../provider/components/CamoxAppContext";
import type { FuturePageRenderInput } from "./futureRuntime";

const unauthenticatedAuthClient = {
  useSession() {
    return { data: null, isPending: false };
  },
};

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
  initApiClient(input.apiUrl, input.environmentName);

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={input.dehydratedState as DehydratedState}>
        <NavigationProvider initialLocation={getInitialLocation(input)}>
          <AuthContext.Provider
            value={{
              authClient: unauthenticatedAuthClient as never,
              authenticationUrl: input.authenticationUrl,
              apiUrl: input.apiUrl,
              projectSlug: input.projectSlug,
              environmentName: input.environmentName,
            }}
          >
            <CamoxAppProvider app={camoxApp}>
              <CamoxPreview>
                <PageContent />
              </CamoxPreview>
            </CamoxAppProvider>
          </AuthContext.Provider>
        </NavigationProvider>
      </HydrationBoundary>
    </QueryClientProvider>
  );
}
