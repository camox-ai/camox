export const FS_PREFIX = "/fs";

export function getSiteUrl() {
  const explicitSiteUrl = (import.meta.env.VITE_CONVEX_SITE_URL ?? "") as string;
  if (explicitSiteUrl) {
    return explicitSiteUrl;
  }

  const convexUrl = (import.meta.env.VITE_CONVEX_URL ?? "") as string;
  if (convexUrl.includes(".cloud")) {
    return convexUrl.replace(/\.cloud$/, ".site");
  }

  // Local Convex backend: HTTP actions are served on port 3211
  if (convexUrl.includes("://localhost") || convexUrl.includes("://127.0.0.1")) {
    return convexUrl.replace(/:(\d+)$/, ":3211");
  }

  throw new Error(
    "Could not derive Convex site URL. Set VITE_CONVEX_SITE_URL for non-cloud deployments.",
  );
}
