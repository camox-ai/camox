import type { AnyTextAdapter } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";

export const AGENT_CHAT_MODEL = "google/gemini-3.1-flash-lite";

export function createAgentChatAdapter(apiKey: string): AnyTextAdapter {
  // The OpenRouter adapter's model union can lag newly released models.
  return createOpenRouterText(AGENT_CHAT_MODEL as never, apiKey) as unknown as AnyTextAdapter;
}
