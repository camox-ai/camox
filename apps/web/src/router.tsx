import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanstackRouter } from "@tanstack/react-router";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance
export function getRouter() {
  const queryClient = new QueryClient();

  const router = createTanstackRouter({
    routeTree,
    defaultPreload: "intent",
    context: { queryClient },
  });

  return router;
}

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
