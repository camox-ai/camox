import type { AuthConfig } from "convex/server";

// Production management backend. Contributors working on the management
// backend itself can override this via the MANAGEMENT_SITE_URL env var.
const managementSiteUrl =
  process.env.MANAGEMENT_SITE_URL ?? "https://prestigious-impala-84.eu-west-1.convex.site";

export default {
  providers: [
    // Better Auth JWTs from management backend
    {
      type: "customJwt",
      issuer: managementSiteUrl,
      applicationID: "convex",
      algorithm: "RS256",
      jwks: `${managementSiteUrl}/api/auth/convex/jwks`,
    },
  ],
} satisfies AuthConfig;
