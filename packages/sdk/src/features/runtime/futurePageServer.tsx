import {
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  type DehydratedState,
} from "@tanstack/react-query";
import { renderToString } from "react-dom/server";

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

export async function renderFuturePageWithApp(
  input: FuturePageRenderInput & { camoxApp: CamoxApp },
) {
  initApiClient(input.apiUrl, input.environmentName);
  const queryClient = new QueryClient();

  return renderToString(
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={input.dehydratedState as DehydratedState}>
        <NavigationProvider
          initialLocation={{
            hash: "",
            href: input.href,
            pathname: input.pathname,
            search: "",
          }}
        >
          <AuthContext.Provider
            value={{
              authClient: unauthenticatedAuthClient as never,
              authenticationUrl: input.authenticationUrl,
              apiUrl: input.apiUrl,
              projectSlug: input.projectSlug,
              environmentName: input.environmentName,
            }}
          >
            <CamoxAppProvider app={input.camoxApp}>
              <CamoxPreview>
                <PageContent />
              </CamoxPreview>
            </CamoxAppProvider>
          </AuthContext.Provider>
        </NavigationProvider>
      </HydrationBoundary>
    </QueryClientProvider>,
  );
}
