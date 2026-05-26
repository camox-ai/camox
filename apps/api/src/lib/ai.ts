import type { AnyTextAdapter } from "@tanstack/ai";
import { createOpenRouterText, type OpenRouterTextModelOptions } from "@tanstack/ai-openrouter";

export const AGENT_CHAT_MODEL = "google/gemini-3.1-flash-lite";

type AgentChatOpenRouterModelOptions = OpenRouterTextModelOptions & {
  reasoning: NonNullable<OpenRouterTextModelOptions["reasoning"]> & {
    enabled: true;
    exclude: false;
  };
};

export const AGENT_CHAT_MODEL_OPTIONS = {
  reasoning: {
    enabled: true,
    effort: "low",
    exclude: false,
  },
} satisfies AgentChatOpenRouterModelOptions;

export function createAgentChatAdapter(apiKey: string): AnyTextAdapter {
  // The OpenRouter adapter's model union can lag newly released models.
  return createOpenRouterText(AGENT_CHAT_MODEL as never, apiKey) as unknown as AnyTextAdapter;
}
