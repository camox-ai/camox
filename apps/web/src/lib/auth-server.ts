import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";

const convexSiteUrl = process.env.VITE_CONVEX_SITE_URL!;

const {
  handler: rawHandler,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthReactStart({
  convexUrl: process.env.VITE_CONVEX_URL!,
  convexSiteUrl,
});

function corsHeaders(request: Request) {
  return {
    "Access-Control-Allow-Origin": request.headers.get("origin") || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, better-auth-cookie",
    "Access-Control-Expose-Headers": "Set-Better-Auth-Cookie",
    "Access-Control-Allow-Credentials": "true",
  };
}

// The library forwards the browser's Origin header to Convex, which causes
// Better Auth to reject requests from arbitrary domains. Since this is a
// server-side proxy, rewrite Origin to match the Convex site URL.
const handler = async (request: Request) => {
  const proxied = new Request(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
    body: request.body,
    duplex: "half",
  } as RequestInit);
  proxied.headers.set("origin", convexSiteUrl);
  proxied.headers.set("x-forwarded-origin", new URL(request.url).origin);

  const response = await rawHandler(proxied);
  const newResponse = new Response(response.body, response);
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    newResponse.headers.set(key, value);
  }

  return newResponse;
};

const handleOptions = (request: Request) => {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
};

export { handler, handleOptions, getToken, fetchAuthQuery, fetchAuthMutation, fetchAuthAction };
