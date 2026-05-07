/**
 * Server-side PostHog tracking for the API.
 *
 * Runs on Cloudflare Workers, so we POST directly to the PostHog ingest
 * endpoint instead of using `posthog-node` (which expects a long-lived
 * Node process for batching/flushing).
 *
 * Always wrap calls in `ctx.waitUntil(...)` so analytics never blocks the
 * response and a slow ingest never delays user-facing latency.
 */

import { POSTHOG_PUBLIC_KEY } from "@camox/api-contract";

const POSTHOG_INGEST_URL = "https://us.i.posthog.com/capture/";

interface TrackEventOptions {
  event: string;
  /** PostHog distinctId. Server-side, we use `project:<id>` so events join with the project group. */
  distinctId: string;
  projectId: number;
  properties?: Record<string, unknown>;
}

/** Maps a free-form `client` identifier to the `surface` taxonomy used in dashboards. */
export function deriveSurface(client: string): "studio" | "cli" | "agent" {
  if (client === "studio") return "studio";
  if (client === "cli") return "cli";
  return "agent";
}

export async function trackEvent({
  event,
  distinctId,
  projectId,
  properties,
}: TrackEventOptions): Promise<void> {
  try {
    await fetch(POSTHOG_INGEST_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_PUBLIC_KEY,
        event,
        distinct_id: distinctId,
        properties: {
          ...properties,
          $groups: { project: String(projectId) },
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // Analytics must never break the request path.
  }
}
