import { Button } from "@camox/ui/button";
import type { UIMessage } from "@tanstack/ai-react";
import { Check, CheckCircle2, Loader2, Wrench, XCircle } from "lucide-react";

import { getToolLabel } from "../agent-chat-labels";

type AgentChatMessagePart = UIMessage["parts"][number];
type ToolCallPart = Extract<AgentChatMessagePart, { type: "tool-call" }>;
type ToolResultPart = Extract<AgentChatMessagePart, { type: "tool-result" }>;

function getStatus(
  part: ToolCallPart,
  requiresApprovalFallback: boolean,
  result?: ToolResultPart | null,
) {
  if (part.approval?.approved === false) return "denied";
  if (result?.state === "error") return "error";
  if (result?.state === "complete") return "complete";
  if (part.output !== undefined) return "complete";
  if (part.approval?.needsApproval && part.approval.approved === undefined) return "approval";
  if (requiresApprovalFallback && part.state === "input-complete") return "approval";
  if (part.state === "complete") return "complete";
  if (part.state === "approval-responded") return "complete";
  return "running";
}

const AgentToolCallCard = ({
  part,
  result,
  requiresApprovalFallback,
  onApprovalResponse,
}: {
  part: ToolCallPart;
  result?: ToolResultPart | null;
  requiresApprovalFallback?: boolean;
  onApprovalResponse?: (approved: boolean) => void;
}) => {
  const status = getStatus(part, requiresApprovalFallback ?? false, result);
  const label = getToolLabel(part.name);
  const needsApproval = status === "approval";

  return (
    <div className="border-border flex flex-col gap-2 rounded-md border px-2.5 py-2">
      <span className="text-muted-foreground flex items-center gap-2">
        {status === "running" && <Loader2 className="size-3 animate-spin" />}
        {status === "complete" && <CheckCircle2 className="size-3" />}
        {status === "approval" && <Wrench className="size-3" />}
        {status === "denied" && <XCircle className="size-3" />}
        {status === "error" && <XCircle className="size-3" />}
        <span className="text-sm">{label}</span>
      </span>
      {needsApproval && (
        <>
          <p className="text-sm">This immediately impacts your live website</p>
          <span className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onApprovalResponse?.(true)}
            >
              <Check data-icon="inline-start" className="text-muted-foreground" />
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onApprovalResponse?.(false)}
            >
              Deny
            </Button>
          </span>
        </>
      )}
    </div>
  );
};

export { AgentToolCallCard };
export type { AgentChatMessagePart, ToolCallPart, ToolResultPart };
