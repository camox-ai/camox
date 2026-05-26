import type { AgentChatRequestContext } from "@camox/api-contract";
import { Alert, AlertDescription, AlertTitle } from "@camox/ui/alert";
import { Button } from "@camox/ui/button";
import { Textarea } from "@camox/ui/textarea";
import { fetchServerSentEvents, useChat, type UseChatReturn } from "@tanstack/ai-react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUp, Brain, Loader2, Square } from "lucide-react";
import * as React from "react";
import { Streamdown, type Components } from "streamdown";

import { getApiClient, getApiUrl, getEnvironmentName } from "@/lib/api-client";
import { getAuthCookieHeader } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { previewStore } from "../../preview/previewStore";
import { buildAgentChatToolLabelContext, getToolCallLabel } from "../agent-chat-labels";
import {
  AgentToolCallCard,
  type AgentChatMessagePart,
  type ToolCallPart,
  type ToolResultPart,
} from "./AgentToolCallCard";

declare const __CAMOX_TELEMETRY_DISABLED__: boolean;

type AgentChatThreadProps = AgentChatRequestContext & {
  disabled?: boolean;
  focusKey?: number;
  pageScaffoldContext?: {
    nickname: string;
    fullPath: string;
  };
};

type AgentChatMessage = UseChatReturn["messages"][number];

function createTextMessage(id: string, role: AgentChatMessage["role"], content: string) {
  return {
    id,
    role,
    parts: [{ type: "text" as const, content }],
  } satisfies AgentChatMessage;
}

function createPageScaffoldMessages({
  nickname,
  fullPath,
}: {
  nickname: string;
  fullPath: string;
}) {
  return [
    createTextMessage(
      `page-scaffold-user:${fullPath}`,
      "user",
      `I just created an empty _${nickname}_ page at \`${fullPath}\`.`,
    ),
    createTextMessage(
      `page-scaffold-assistant:${fullPath}`,
      "assistant",
      "I can create a draft of the page structure and content.<br/>**What should this page be about?**",
    ),
  ];
}

function getTextPartContent(part: AgentChatMessagePart) {
  if (part.type !== "text") return null;
  return part.content;
}

function hasVisibleAssistantOutput(message: AgentChatMessage) {
  return message.parts.some((part) => {
    if (part.type === "text") return part.content.trim().length > 0;
    if (part.type === "thinking") return true;
    if (part.type === "tool-call") return true;
    return false;
  });
}

function isAssistantResponseOutputPart(part: AgentChatMessagePart) {
  if (part.type === "text") return part.content.trim().length > 0;
  if (part.type === "tool-call") return true;
  return false;
}

function getAssistantResponseOutputKey(message: AgentChatMessage) {
  const outputParts = message.parts.flatMap((part) => {
    if (part.type === "text" && isAssistantResponseOutputPart(part)) {
      return [`text:${part.content.length}`];
    }
    if (part.type === "tool-call") return [`tool:${part.id}:${part.state}`];
    return [];
  });
  return outputParts.length > 0 ? outputParts.join("|") : null;
}

function hasLaterAssistantResponseOutput(
  parts: readonly AgentChatMessagePart[],
  partIndex: number,
) {
  return parts.slice(partIndex + 1).some(isAssistantResponseOutputPart);
}

function hasThinkingPart(message: AgentChatMessage) {
  return message.parts.some((part) => part.type === "thinking");
}

function getThinkingPartDurationKey(
  message: AgentChatMessage,
  part: AgentChatMessagePart,
  partIndex: number,
) {
  const stepId = (part as { stepId?: unknown }).stepId;
  return `${message.id}:${typeof stepId === "string" ? stepId : partIndex}`;
}

function formatThinkingDuration(seconds: number) {
  return Math.max(1, Math.round(seconds)).toString();
}

function hasRequiresApprovalMetadata(part: ToolCallPart) {
  const metadata = (part as { metadata?: { risk?: unknown } }).metadata;
  return metadata?.risk === "requiresApproval";
}

function findToolResult(parts: readonly AgentChatMessagePart[], toolCallId: string) {
  return parts.find(
    (part): part is ToolResultPart => part.type === "tool-result" && part.toolCallId === toolCallId,
  );
}

const markdownComponents = {
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  a: ({ children, ...props }) => (
    <a {...props} className="wrap-break-words underline underline-offset-2">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-current/30 pl-3">{children}</blockquote>
  ),
  code: ({ children }) => (
    <code className="bg-background/50 rounded px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="bg-background/50 my-2 max-w-full overflow-x-auto rounded-md p-3 text-xs">
      {children}
    </pre>
  ),
} satisfies Components;

const MessageBubble = ({
  message,
  source,
  isThinkingActive,
  activeThinkingDurationKeys,
  thinkingDurations,
  toolLabelContext,
  onApprovalResponse,
}: {
  message: AgentChatMessage;
  source: AgentChatRequestContext["source"];
  isThinkingActive?: boolean;
  activeThinkingDurationKeys: ReadonlySet<string>;
  thinkingDurations: Record<string, number>;
  toolLabelContext: ReturnType<typeof buildAgentChatToolLabelContext>;
  onApprovalResponse: (part: ToolCallPart, approved: boolean) => void;
}) => {
  const isUser = message.role === "user";
  const fallbackThinkingDurationSeconds = thinkingDurations[message.id];
  const shouldShowMessageThinkingIndicator =
    !isUser &&
    !hasThinkingPart(message) &&
    (isThinkingActive || fallbackThinkingDurationSeconds !== undefined);

  return (
    <div className={cn("flex gap-3", isUser && "justify-end")}>
      <div className={cn("space-y-1", isUser ? "max-w-[85%]" : "max-w-full")}>
        <div
          className={cn(
            "text-sm",
            isUser
              ? "bg-primary text-primary-foreground rounded-lg px-3 py-2"
              : "text-foreground space-y-3",
          )}
        >
          {shouldShowMessageThinkingIndicator && (
            <AgentThinkingIndicator durationSeconds={fallbackThinkingDurationSeconds} />
          )}
          {message.parts.map((part, index) => {
            const text = getTextPartContent(part);
            if (text != null) {
              if (text.trim().length === 0) return null;

              return (
                <Streamdown
                  key={index}
                  className={cn("wrap-break-words space-y-2", !isUser && "pl-6")}
                  components={markdownComponents}
                  controls={false}
                  isAnimating={!isUser}
                >
                  {text}
                </Streamdown>
              );
            }
            if (part.type === "thinking") {
              const durationKey = getThinkingPartDurationKey(message, part, index);
              const durationSeconds =
                thinkingDurations[durationKey] ??
                (hasLaterAssistantResponseOutput(message.parts, index)
                  ? fallbackThinkingDurationSeconds
                  : undefined);
              if (durationSeconds !== undefined || activeThinkingDurationKeys.has(durationKey)) {
                return (
                  <AgentThinkingIndicator key={durationKey} durationSeconds={durationSeconds} />
                );
              }
              return null;
            }
            if (part.type === "tool-call") {
              return (
                <AgentToolCallCard
                  key={part.id}
                  part={part}
                  label={getToolCallLabel(part, toolLabelContext)}
                  result={findToolResult(message.parts, part.id)}
                  requiresApprovalFallback={source === "draft" && hasRequiresApprovalMetadata(part)}
                  onApprovalResponse={(approved) => onApprovalResponse(part, approved)}
                />
              );
            }
            if (part.type === "tool-result") {
              return null;
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
};

const AgentThinkingIndicator = ({ durationSeconds }: { durationSeconds?: number }) => {
  if (durationSeconds !== undefined) {
    return (
      <div className="text-muted-foreground grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 text-sm">
        <Brain className="size-3 justify-self-center" />
        <span>Thought for {formatThinkingDuration(durationSeconds)}s</span>
      </div>
    );
  }

  return (
    <div className="text-muted-foreground grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 text-sm">
      <Loader2 className="size-3 animate-spin justify-self-center" />
      <span>Thinking...</span>
    </div>
  );
};

const AgentChatThread = ({
  projectId,
  currentPath,
  source,
  disabled,
  focusKey = 0,
  pageScaffoldContext,
}: AgentChatThreadProps) => {
  const [input, setInput] = React.useState("");
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const thinkingStartedAtRef = React.useRef<number | null>(null);
  const thinkingSegmentStartsRef = React.useRef(new Map<string, number>());
  const toolCallContextByIdRef = React.useRef(
    new Map<string, { currentPath: string; source: AgentChatRequestContext["source"] }>(),
  );
  const [thinkingDurations, setThinkingDurations] = React.useState<Record<string, number>>({});
  const [activeThinkingDurationKeys, setActiveThinkingDurationKeys] = React.useState(
    () => new Set<string>(),
  );
  const navigate = useNavigate();
  const initialMessages = React.useMemo(() => {
    if (!pageScaffoldContext) return [];
    return createPageScaffoldMessages(pageScaffoldContext);
  }, [pageScaffoldContext]);

  const connection = React.useMemo(
    () =>
      fetchServerSentEvents(`${getApiUrl()}/agent/chat`, () => {
        const headers: Record<string, string> = {
          "Better-Auth-Cookie": getAuthCookieHeader(),
          "x-camox-client": "studio",
        };
        const environmentName = getEnvironmentName();
        if (environmentName) headers["x-environment-name"] = environmentName;
        if (__CAMOX_TELEMETRY_DISABLED__) headers["x-camox-telemetry-disabled"] = "1";

        return {
          headers,
          credentials: "omit",
          body: { projectId, currentPath, source },
        };
      }),
    [currentPath, projectId, source],
  );

  const handleCustomEvent = React.useCallback(
    (eventType: string, data: unknown) => {
      if (eventType !== "agent-chat-ui-action") return;
      if (!data || typeof data !== "object") return;

      const action = (data as { action?: unknown }).action;
      if (action === "navigate") {
        const fullPath = (data as { fullPath?: unknown }).fullPath;
        if (typeof fullPath !== "string" || !fullPath.startsWith("/")) return;
        if (fullPath === currentPath) return;
        void navigate({ to: fullPath });
        return;
      }

      if (action !== "focusBlock") return;
      const blockId = (data as { blockId?: unknown }).blockId;
      if (typeof blockId !== "number") return;

      previewStore.send({ type: "setFocusedBlock", blockId });
    },
    [currentPath, navigate],
  );

  const { messages, sendMessage, isLoading, error, stop, addToolApprovalResponse, addToolResult } =
    useChat({
      connection,
      body: { projectId, currentPath, source },
      initialMessages,
      onCustomEvent: handleCustomEvent,
    });
  const lastMessage = messages[messages.length - 1];
  const lastAssistantMessage =
    lastMessage?.role === "assistant"
      ? lastMessage
      : [...messages].reverse().find((message) => message.role === "assistant");
  const activeThinkingMessageId =
    isLoading && thinkingStartedAtRef.current !== null && lastMessage?.role === "assistant"
      ? lastMessage.id
      : undefined;
  const lastMessageResponseOutputKey =
    lastMessage?.role === "assistant" ? getAssistantResponseOutputKey(lastMessage) : null;
  const shouldShowThinkingFallback =
    isLoading &&
    thinkingStartedAtRef.current !== null &&
    !error &&
    (!lastMessage ||
      lastMessage.role === "user" ||
      (lastMessage.role === "assistant" && !hasVisibleAssistantOutput(lastMessage)));
  const toolCallContextById = React.useMemo(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type !== "tool-call") continue;
        if (toolCallContextByIdRef.current.has(part.id)) continue;
        toolCallContextByIdRef.current.set(part.id, { currentPath, source });
      }
    }

    return new Map(toolCallContextByIdRef.current);
  }, [currentPath, messages, source]);
  const toolLabelContext = React.useMemo(
    () =>
      buildAgentChatToolLabelContext({
        messages,
        currentPath,
        source,
        toolCallContextById,
      }),
    [currentPath, messages, source, toolCallContextById],
  );

  React.useEffect(() => {
    const now = Date.now();
    const activeDurationKeys = new Set<string>();
    setThinkingDurations((durations) => {
      let nextDurations = durations;

      for (const message of messages) {
        if (message.role !== "assistant") continue;

        message.parts.forEach((part, index) => {
          if (part.type !== "thinking") return;

          const durationKey = getThinkingPartDurationKey(message, part, index);
          if (durations[durationKey] !== undefined) return;

          const startedAt = thinkingSegmentStartsRef.current.get(durationKey) ?? now;
          thinkingSegmentStartsRef.current.set(durationKey, startedAt);
          if (!hasLaterAssistantResponseOutput(message.parts, index)) {
            activeDurationKeys.add(durationKey);
            return;
          }

          if (nextDurations === durations) nextDurations = { ...durations };
          nextDurations[durationKey] = Math.max(0, (now - startedAt) / 1000);
          thinkingSegmentStartsRef.current.delete(durationKey);
        });
      }

      return nextDurations;
    });
    setActiveThinkingDurationKeys(activeDurationKeys);
  }, [messages]);

  React.useEffect(() => {
    if (!isLoading) return;
    if (thinkingStartedAtRef.current !== null) return;
    thinkingStartedAtRef.current = Date.now();
  }, [isLoading]);

  React.useEffect(() => {
    const startedAt = thinkingStartedAtRef.current;
    if (startedAt === null) return;
    if (lastMessage?.role !== "assistant") return;
    if (!lastMessageResponseOutputKey) return;

    thinkingStartedAtRef.current = null;
    const durationSeconds = Math.max(0, (Date.now() - startedAt) / 1000);
    setThinkingDurations((durations) => ({
      ...durations,
      [lastMessage.id]: durations[lastMessage.id] ?? durationSeconds,
    }));
  }, [lastMessage?.id, lastMessage?.role, lastMessageResponseOutputKey]);

  React.useEffect(() => {
    if (isLoading) return;
    const startedAt = thinkingStartedAtRef.current;
    if (startedAt === null) return;

    thinkingStartedAtRef.current = null;
    if (!lastAssistantMessage) return;

    const durationSeconds = Math.max(0, (Date.now() - startedAt) / 1000);
    setThinkingDurations((durations) => ({
      ...durations,
      [lastAssistantMessage.id]: durationSeconds,
    }));
  }, [isLoading, lastAssistantMessage]);

  React.useEffect(() => {
    if (focusKey === 0) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [focusKey]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const handleApprovalResponse = async (part: ToolCallPart, approved: boolean) => {
    const errorText = "User declined tool execution";
    const refocusInput = () => requestAnimationFrame(() => inputRef.current?.focus());
    if (!approved) {
      if (part.approval) await addToolApprovalResponse({ id: part.approval.id, approved: false });
      await addToolResult({
        toolCallId: part.id,
        tool: part.name,
        output: { error: errorText },
        state: "output-error",
        errorText,
      });
      refocusInput();
      return;
    }

    if (source !== "draft") {
      await addToolResult({
        toolCallId: part.id,
        tool: part.name,
        output: { error: "This tool cannot be approved from the current source." },
        state: "output-error",
        errorText: "This tool cannot be approved from the current source.",
      });
      refocusInput();
      return;
    }

    let args: unknown = {};
    try {
      args = part.input ?? (part.arguments ? JSON.parse(part.arguments) : {});
    } catch {
      await addToolResult({
        toolCallId: part.id,
        tool: part.name,
        output: { error: "Could not parse tool arguments." },
        state: "output-error",
        errorText: "Could not parse tool arguments.",
      });
      refocusInput();
      return;
    }

    const response = await getApiClient().agent.callTool({
      projectId,
      name: part.name,
      arguments: args,
    });

    if (response.ok) {
      if (part.approval) await addToolApprovalResponse({ id: part.approval.id, approved: true });
      await addToolResult({ toolCallId: part.id, tool: part.name, output: response.result });
      refocusInput();
      return;
    }

    await addToolResult({
      toolCallId: part.id,
      tool: part.name,
      output: response.error,
      state: "output-error",
      errorText: response.error.message,
    });
    refocusInput();
  };

  const handleSubmit = (event: React.SubmitEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || isLoading || disabled) return;
    setInput("");
    void sendMessage(message);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto border-t p-4">
        {messages.map((message, index) => {
          const previousMessage = messages[index - 1];
          const isConsecutiveAssistantMessage =
            message.role === "assistant" && previousMessage?.role === "assistant";

          return (
            <div
              key={message.id}
              className={cn(index > 0 && "mt-4", isConsecutiveAssistantMessage && "mt-3")}
            >
              <MessageBubble
                message={message}
                source={source}
                isThinkingActive={activeThinkingMessageId === message.id}
                activeThinkingDurationKeys={activeThinkingDurationKeys}
                thinkingDurations={thinkingDurations}
                toolLabelContext={toolLabelContext}
                onApprovalResponse={(part, approved) => void handleApprovalResponse(part, approved)}
              />
            </div>
          );
        })}
        {shouldShowThinkingFallback && (
          <div className={cn(messages.length > 0 && "mt-3")}>
            <AgentThinkingIndicator />
          </div>
        )}
        {error && (
          <div className={cn((messages.length > 0 || shouldShowThinkingFallback) && "mt-4")}>
            <Alert variant="destructive">
              <AlertTitle>Agent Chat failed</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="border-border border-t p-4">
        <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex items-center gap-2 rounded-2xl border px-3 transition-colors focus-within:ring-[3px]">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            disabled={disabled}
            placeholder={
              disabled ? "Switch to draft to chat" : "Ask for changes or inspect this page…"
            }
            className="max-h-32 min-h-10 resize-none border-0 bg-inherit! px-0 py-4 leading-6 shadow-none focus-visible:ring-0"
          />
          {isLoading ? (
            <Button
              type="button"
              size="icon"
              className="shrink-0"
              aria-label="Stop response"
              onClick={stop}
            >
              <Square className="size-4 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={disabled || !input.trim()}
              size="icon"
              className="shrink-0"
            >
              <span className="sr-only">Send message</span>
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
};

export { AgentChatThread };
