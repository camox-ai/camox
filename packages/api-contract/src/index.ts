import type { ModelMessage, UIMessage } from "@tanstack/ai";

export type { Router } from "../../../apps/api/src/router";

export type AgentChatSource = "draft" | "live";

export type AgentChatRequestContext = {
  projectId: number;
  currentPath: string;
  source: AgentChatSource;
};

export type AgentChatMessage = ModelMessage | UIMessage;

export type AgentChatRequest = AgentChatRequestContext & {
  messages: AgentChatMessage[];
};

/**
 * Public PostHog project key. Safe to ship in client bundles — write-only and
 * scoped to ingest. Lives here (rather than per-package) so the SDK studio,
 * the SDK SSR helpers, the CLI, and the Workers API all reference the same value.
 */
export const POSTHOG_PUBLIC_KEY = "phc_nK5sZHMRNMwV6YLf3NjvurWT3quFkP7YxzC6T9R4bodc";
