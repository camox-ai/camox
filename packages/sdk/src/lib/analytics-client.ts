import posthog from "posthog-js";

declare const __CAMOX_ANALYTICS_DISABLED__: boolean;

const POSTHOG_API_KEY = "phc_DV6H1bUHFvtNFfhyiq9skEQMniuyxs3HLx06TajB6Fw";

let initialized = false;

function ensureInitialized() {
  if (__CAMOX_ANALYTICS_DISABLED__) return false;
  if (typeof window === "undefined") return false;
  if (!initialized) {
    posthog.init(POSTHOG_API_KEY, {
      api_host: "https://t.camox.ai",
      ui_host: "https://us.posthog.com",
      defaults: "2026-01-30",
      autocapture: false,
      persistence: "localStorage+cookie",
      before_send: (event) => {
        if (
          window.location.hostname === "localhost" &&
          (event?.event === "$pageview" || event?.event === "$pageleave")
        ) {
          return null;
        }
        return event;
      },
    });
    initialized = true;
  }
  return true;
}

/** Client-side tracking for CMS actions. Events route through t.camox.ai reverse proxy. */
export function trackClientEvent(event: string, properties: Record<string, unknown>) {
  if (!ensureInitialized()) return;
  posthog.capture(event, properties);
}
