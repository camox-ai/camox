import type { AgentChatRequestContext } from "@camox/api-contract";
import { Alert, AlertDescription, AlertTitle } from "@camox/ui/alert";
import { Button } from "@camox/ui/button";
import { Textarea } from "@camox/ui/textarea";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { Bot, Info, Send, User } from "lucide-react";
import * as React from "react";

import { getApiUrl, getEnvironmentName } from "@/lib/api-client";
import { getAuthCookieHeader } from "@/lib/auth";
import { cn } from "@/lib/utils";

import { AgentToolCallCard, type ToolCallPart } from "./AgentToolCallCard";

declare const __CAMOX_TELEMETRY_DISABLED__: boolean;

type AgentChatThreadProps = AgentChatRequestContext & {
  disabled?: boolean;
};

function getTextPartContent(part: { type: string; content?: unknown }) {
  if (part.type !== "text") return null;
  return typeof part.content === "string" ? part.content : null;
}

const MessageBubble = ({
  message,
}: {
  message: ReturnType<typeof useChat>["messages"][number];
}) => {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "justify-end")}>
      {!isUser && (
        <div className="bg-primary text-primary-foreground mt-1 flex size-7 shrink-0 items-center justify-center rounded-full">
          <Bot className="size-4" />
        </div>
      )}
      <div className={cn("max-w-[85%] space-y-1", isUser && "order-first")}>
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {message.parts.map((part, index) => {
            const text = getTextPartContent(part);
            if (text != null) {
              return (
                <p key={index} className="whitespace-pre-wrap">
                  {text}
                </p>
              );
            }
            if (part.type === "tool-call") {
              return <AgentToolCallCard key={part.id} part={part as ToolCallPart} />;
            }
            if (part.type === "tool-result") {
              return null;
            }
            return null;
          })}
        </div>
      </div>
      {isUser && (
        <div className="bg-muted text-muted-foreground mt-1 flex size-7 shrink-0 items-center justify-center rounded-full">
          <User className="size-4" />
        </div>
      )}
    </div>
  );
};

const AgentChatThread = ({ projectId, currentPath, source, disabled }: AgentChatThreadProps) => {
  const [input, setInput] = React.useState("");
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

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

  const { messages, sendMessage, isLoading, error } = useChat({
    connection,
    body: { projectId, currentPath, source },
  });

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

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
            <AlertTitle>Ask Agent Chat to inspect this page</AlertTitle>
            <AlertDescription>
              Try “What blocks are on this page?” or “Summarize the current draft.”
            </AlertDescription>
          </Alert>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
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
        <div className="flex gap-2">
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
            className="max-h-32 min-h-10 resize-none"
          />
          <Button type="submit" disabled={disabled || isLoading || !input.trim()} size="icon">
            <Send className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
};

export { AgentChatThread };
