import type { AgentChatRequestContext } from "@camox/api-contract";
import { Alert, AlertDescription, AlertTitle } from "@camox/ui/alert";
import { Button } from "@camox/ui/button";
import { Textarea } from "@camox/ui/textarea";
import { fetchServerSentEvents, useChat, type UseChatReturn } from "@tanstack/ai-react";
import { Info, ArrowUp } from "lucide-react";
import * as React from "react";
import { Streamdown, type Components } from "streamdown";

import { getApiClient, getApiUrl, getEnvironmentName } from "@/lib/api-client";
import { getAuthCookieHeader } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { previewStore } from "../../preview/previewStore";
import {
  AgentToolCallCard,
  type AgentChatMessagePart,
  type ToolCallPart,
  type ToolResultPart,
} from "./AgentToolCallCard";

declare const __CAMOX_TELEMETRY_DISABLED__: boolean;

type AgentChatThreadProps = AgentChatRequestContext & {
  disabled?: boolean;
};

type AgentChatMessage = UseChatReturn["messages"][number];

function getTextPartContent(part: AgentChatMessagePart) {
  if (part.type !== "text") return null;
  return part.content;
}

function findToolResult(parts: readonly AgentChatMessagePart[], toolCallId: string) {
  return parts.find(
    (part): part is ToolResultPart => part.type === "tool-result" && part.toolCallId === toolCallId,
  );
}

function getToolResultOutput(result: ToolResultPart) {
  try {
    return JSON.parse(result.content) as unknown;
  } catch {
    return result.content;
  }
}

function getSelectedBlockIdFromToolOutput(params: {
  toolName: string | undefined;
  output: unknown;
  isError?: boolean;
}) {
  const { toolName, output, isError } = params;
  if (toolName !== "createBlock" && toolName !== "editBlock") return null;
  if (isError) return null;
  if (!output || typeof output !== "object") return null;

  const id = (output as { id?: unknown }).id;
  return typeof id === "number" ? id : null;
}

const markdownComponents = {
  p: ({ children }) => <p className="leading-relaxed">{children}</p>,
  a: ({ children, ...props }) => (
    <a {...props} className="break-words underline underline-offset-2">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-current/30 pl-3">{children}</blockquote>
  ),
  code: ({ children }) => (
    <code className="bg-background/60 rounded px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="bg-background/60 my-2 max-w-full overflow-x-auto rounded-md p-3 text-xs">
      {children}
    </pre>
  ),
} satisfies Components;

const MessageBubble = ({
  message,
  onApprovalResponse,
}: {
  message: AgentChatMessage;
  onApprovalResponse: (part: ToolCallPart, approved: boolean) => void;
}) => {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "justify-end")}>
      <div className={cn("space-y-1", isUser ? "max-w-[85%]" : "max-w-full")}>
        <div
          className={cn(
            "text-sm",
            isUser
              ? "bg-primary text-primary-foreground rounded-lg px-3 py-2"
              : "text-foreground space-y-2",
          )}
        >
          {message.parts.map((part, index) => {
            const text = getTextPartContent(part);
            if (text != null) {
              return (
                <Streamdown
                  key={index}
                  className="wrap-break-words space-y-2"
                  components={markdownComponents}
                  controls={false}
                  isAnimating={!isUser}
                >
                  {text}
                </Streamdown>
              );
            }
            if (part.type === "tool-call") {
              return (
                <AgentToolCallCard
                  key={part.id}
                  part={part}
                  result={findToolResult(message.parts, part.id)}
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

const AgentChatThread = ({ projectId, currentPath, source, disabled }: AgentChatThreadProps) => {
  const [input, setInput] = React.useState("");
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const selectedToolResultIdsRef = React.useRef(new Set<string>());

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

  const { messages, sendMessage, isLoading, error, addToolApprovalResponse, addToolResult } =
    useChat({
      connection,
      body: { projectId, currentPath, source },
    });

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  React.useEffect(() => {
    for (const message of messages) {
      const toolNameByCallId = new Map<string, string>();
      for (const part of message.parts) {
        if (part.type !== "tool-call") continue;
        toolNameByCallId.set(part.id, part.name);
      }

      for (const part of message.parts) {
        if (part.type === "tool-call") {
          if (part.output === undefined) continue;
          if (selectedToolResultIdsRef.current.has(part.id)) continue;

          const blockId = getSelectedBlockIdFromToolOutput({
            toolName: part.name,
            output: part.output,
          });
          if (!blockId) continue;

          selectedToolResultIdsRef.current.add(part.id);
          previewStore.send({ type: "setFocusedBlock", blockId });
          continue;
        }

        if (part.type !== "tool-result") continue;

        const toolName = toolNameByCallId.get(part.toolCallId);
        if (selectedToolResultIdsRef.current.has(part.toolCallId)) continue;

        const blockId = getSelectedBlockIdFromToolOutput({
          toolName,
          output: getToolResultOutput(part),
          isError: part.state === "error" || !!part.error,
        });
        if (!blockId) continue;

        selectedToolResultIdsRef.current.add(part.toolCallId);
        previewStore.send({ type: "setFocusedBlock", blockId });
      }
    }
  }, [messages]);

  const handleApprovalResponse = async (part: ToolCallPart, approved: boolean) => {
    const errorText = "User declined tool execution";
    if (!approved) {
      if (part.approval) await addToolApprovalResponse({ id: part.approval.id, approved: false });
      await addToolResult({
        toolCallId: part.id,
        tool: part.name,
        output: { error: errorText },
        state: "output-error",
        errorText,
      });
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
      return;
    }

    await addToolResult({
      toolCallId: part.id,
      tool: part.name,
      output: response.error,
      state: "output-error",
      errorText: response.error.message,
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || isLoading || disabled) return;
    setInput("");
    void sendMessage(message);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <Alert>
            <Info className="size-4" />
            <AlertTitle>Camox is most powerful in your coding agent</AlertTitle>
            <AlertDescription>
              Use Claude Code or Codex to manage your site with both code and content access.
            </AlertDescription>
          </Alert>
        )}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onApprovalResponse={(part, approved) => void handleApprovalResponse(part, approved)}
          />
        ))}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Agent Chat failed</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="border-border border-t p-4">
        <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex items-center gap-2 rounded-2xl border px-3 py-2 transition-colors focus-within:ring-[3px]">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            disabled={disabled || isLoading}
            placeholder={
              disabled ? "Switch to draft to chat" : "Ask for changes or inspect this page…"
            }
            className="max-h-32 min-h-10 resize-none border-0 bg-inherit! px-0 py-2 shadow-none focus-visible:ring-0"
          />
          <Button
            type="submit"
            disabled={disabled || isLoading || !input.trim()}
            size="icon"
            className="shrink-0"
          >
            <span className="sr-only">Send message</span>
            <ArrowUp className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};

export { AgentChatThread };
