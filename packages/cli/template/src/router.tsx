import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanstackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient();

  const router = createTanstackRouter({
    routeTree,
    defaultPreload: "intent",
    // Providing queryClient to the router context is required by Camox.
    // All Camox queries start with a "camox" prefix in the query key array,
    // so you can share the same client without risking conflicting keys.
    context: { queryClient },
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    wrapQueryClient: true,
  });

  return router;
}

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
