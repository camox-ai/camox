import { Button } from "@camox/ui/button";
import { CheckCircle2, Loader2, Wrench, XCircle } from "lucide-react";

import { getToolLabel } from "../agent-chat-labels";

type ToolCallPart = {
  type: "tool-call";
  id: string;
  name: string;
  state: string;
  arguments?: string;
  input?: unknown;
  output?: unknown;
  metadata?: { risk?: string };
  approval?: { id: string; needsApproval: boolean; approved?: boolean };
};

type ToolResultPart = {
  type: "tool-result";
  toolCallId: string;
  content: string;
  state: string;
  error?: string;
};

function getStatus(part: ToolCallPart, approvalFallback: boolean, result?: ToolResultPart | null) {
  if (part.approval?.approved === false) return "denied";
  if (result?.state === "error") return "error";
  if (result?.state === "complete") return "complete";
  if (part.output !== undefined) return "complete";
  if (part.approval?.needsApproval && part.approval.approved === undefined) return "approval";
  if (approvalFallback && part.state === "input-complete") return "approval";
  if (part.state === "complete") return "complete";
  if (part.state === "approval-responded") return "complete";
  return "running";
}

const AgentToolCallCard = ({
  part,
  requiresApprovalFallback,
  result,
  onApprovalResponse,
}: {
  part: ToolCallPart;
  result?: ToolResultPart | null;
  requiresApprovalFallback?: boolean;
  onApprovalResponse?: (approved: boolean) => void;
}) => {
  const status = getStatus(part, requiresApprovalFallback ?? false, result);
  const label = getToolLabel(part.name);

  return (
    <div className="text-muted-foreground my-2 flex flex-wrap items-center gap-2 text-xs">
      <span className="flex items-center gap-2">
        {status === "running" && <Loader2 className="size-3 animate-spin" />}
        {status === "complete" && <CheckCircle2 className="size-3" />}
        {status === "approval" && <Wrench className="size-3" />}
        {status === "denied" && <XCircle className="size-3" />}
        {status === "error" && <XCircle className="size-3" />}
        <span>{label}</span>
      </span>
      {status === "approval" && (
        <span className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onApprovalResponse?.(true)}
          >
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
      )}
    </div>
  );
};

export { AgentToolCallCard };
export type { ToolCallPart, ToolResultPart };
