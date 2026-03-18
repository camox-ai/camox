import { createFileRoute } from "@tanstack/react-router";

import { handler, handleOptions } from "@/lib/auth-server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
      OPTIONS: ({ request }) => handleOptions(request),
    },
  },
});
