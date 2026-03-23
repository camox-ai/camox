# 08 — AI Proxy via Management

## Goal

Keep AI API keys out of the backend (which users run locally). All LLM calls go through a management HTTP endpoint that owns the API key, resolves models, and tracks usage.

## How it works

Backend uses TanStack AI with a custom adapter pointing at management's `/ai/chat` endpoint, authenticated with the shared secret. The backend sends messages, tools, and structured output schemas — management forwards them to OpenRouter and streams the response back.

Management is a transparent proxy. It never interprets prompts, tools, or schemas. All agent logic and tool execution stays in the backend.

## Intelligence scale

Instead of fixed model names, the backend sends a numeric `intelligence` level (1–10). Management resolves this to a concrete model based on what's available and the customer's billing plan (e.g. free users capped at a lower ceiling).

- **1–2**: Cheapest/fastest (summaries, labels)
- **3–4**: Light reasoning (alt text, metadata)
- **5–6**: General purpose (SEO, content suggestions)
- **7–8**: Strong reasoning (page drafts, structured generation)
- **9–10**: Best available (complex agents, multi-step tool calling)

Model assignments change server-side without SDK updates.

## Agentic tool loops

TanStack AI handles the tool loop in the backend action. Only LLM roundtrips hit the proxy. Tool execution happens locally with direct DB access. This means management doesn't need to know about content schemas or available tools.

## Depends on

- Plan 03 (shared secret between management and backend)
