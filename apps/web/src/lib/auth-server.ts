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

// The library forwards the browser's Origin header to Convex, which causes
// Better Auth to reject requests from arbitrary domains. Since this is a
// server-side proxy, rewrite Origin to match the Convex site URL.
const handler = (request: Request) => {
  request.headers.set("origin", convexSiteUrl);
  return rawHandler(request);
};

export { handler, getToken, fetchAuthQuery, fetchAuthMutation, fetchAuthAction };
