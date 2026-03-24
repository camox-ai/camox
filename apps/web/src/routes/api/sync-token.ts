import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/sync-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { token } = (await request.json()) as { token?: string };
        if (!token || typeof token !== "string") {
          return new Response("Missing token", { status: 400 });
        }

        return new Response(null, {
          status: 204,
          headers: {
            "Set-Cookie": `convex_jwt=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900`,
          },
        });
      },
    },
  },
});
