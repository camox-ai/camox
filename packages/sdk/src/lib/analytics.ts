import type { PostHog } from "posthog-node";

declare const __CAMOX_ANALYTICS_DISABLED__: boolean;

const POSTHOG_API_KEY = "phc_DV6H1bUHFvtNFfhyiq9skEQMniuyxs3HLx06TajB6Fw";

let client: PostHog | null = null;

async function getClient(): Promise<PostHog | null> {
  if (__CAMOX_ANALYTICS_DISABLED__) return null;
  if (!client) {
    const { PostHog } = await import("posthog-node");
    client = new PostHog(POSTHOG_API_KEY, {
      host: "https://us.i.posthog.com",
    });
  }
  return client;
}

/** Server-side tracking for page views (used in pageRoute.tsx) */
export async function trackEvent(event: string, properties: Record<string, unknown>) {
  const posthog = await getClient();
  if (!posthog) return;
  const distinctId = (properties.projectId as string) ?? "unknown";
  posthog.capture({ distinctId, event, properties });
}
