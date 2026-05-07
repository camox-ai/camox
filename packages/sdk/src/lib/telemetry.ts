import { POSTHOG_PUBLIC_KEY } from "@camox/api-contract";
import type { PostHog } from "posthog-node";

declare const __CAMOX_TELEMETRY_DISABLED__: boolean;

let client: PostHog | null = null;

async function getClient(): Promise<PostHog | null> {
  if (__CAMOX_TELEMETRY_DISABLED__) return null;
  if (!client) {
    const { PostHog } = await import("posthog-node");
    client = new PostHog(POSTHOG_PUBLIC_KEY, {
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
