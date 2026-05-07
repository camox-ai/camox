import { POSTHOG_PUBLIC_KEY } from "@camox/api-contract";
import posthog from "posthog-js";

declare const __CAMOX_TELEMETRY_DISABLED__: boolean;

let initialized = false;

function ensureInitialized() {
  if (__CAMOX_TELEMETRY_DISABLED__) return false;
  if (typeof window === "undefined") return false;
  if (initialized) return true;
  posthog.init(POSTHOG_PUBLIC_KEY, {
    api_host: "https://t.camox.ai",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    autocapture: false,
    persistence: "localStorage+cookie",
  });
  posthog.register({
    host: window.location.hostname,
    isLocalhost: window.location.hostname === "localhost",
  });
  initialized = true;
  return true;
}

interface IdentifyUserOptions {
  userId: string;
  email?: string;
  name?: string;
}

let lastIdentifiedUserId: string | null = null;

/**
 * Identifies the authenticated user. distinctId matches the server-side
 * `ctx.user.id` so studio + CLI/agent events for the same person unify.
 * Idempotent per userId.
 */
export function identifyUser(options: IdentifyUserOptions) {
  if (!ensureInitialized()) return;
  if (lastIdentifiedUserId === options.userId) return;
  lastIdentifiedUserId = options.userId;

  posthog.identify(options.userId, {
    email: options.email,
    name: options.name,
  });
}

interface IdentifyProjectOptions {
  projectId: number;
  projectSlug: string;
  projectName?: string;
  environmentName?: string | null;
}

let lastIdentifiedProjectId: number | null = null;

/**
 * Registers project context as PostHog super properties + group.
 * Idempotent per projectId — call freely from React effects.
 */
export function identifyProject(options: IdentifyProjectOptions) {
  if (!ensureInitialized()) return;
  if (lastIdentifiedProjectId === options.projectId) return;
  lastIdentifiedProjectId = options.projectId;

  posthog.register({
    projectId: options.projectId,
    projectSlug: options.projectSlug,
    environmentName: options.environmentName ?? null,
    surface: "studio",
  });

  posthog.group("project", String(options.projectId), {
    name: options.projectName,
    slug: options.projectSlug,
  });
}

/** Client-side tracking for CMS actions. Events route through t.camox.ai reverse proxy. */
export function trackClientEvent(event: string, properties?: Record<string, unknown>) {
  if (!ensureInitialized()) return;
  posthog.capture(event, properties);
}
