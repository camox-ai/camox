export type { Router } from "../../../apps/api/src/router";

/**
 * Public PostHog project key. Safe to ship in client bundles — write-only and
 * scoped to ingest. Lives here (rather than per-package) so the SDK studio,
 * the SDK SSR helpers, the CLI, and the Workers API all reference the same value.
 */
export const POSTHOG_PUBLIC_KEY = "phc_DV6H1bUHFvtNFfhyiq9skEQMniuyxs3HLx06TajB6Fw";
