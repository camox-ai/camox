import { Badge } from "@camox/ui/badge";
import { Button } from "@camox/ui/button";
import { CheckCircle2, Loader2, Wrench, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

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
    <div className="bg-muted/50 text-muted-foreground my-2 rounded-md border p-2 text-xs">
      <div className="flex items-center gap-2">
        {status === "running" && <Loader2 className="size-3 animate-spin" />}
        {status === "complete" && <CheckCircle2 className="size-3 text-green-600" />}
        {status === "approval" && <Wrench className="size-3 text-amber-600" />}
        {status === "denied" && <XCircle className="size-3 text-red-600" />}
        {status === "error" && <XCircle className="size-3 text-red-600" />}
        <span className="text-foreground font-medium">
          {status === "running" ? `Running ${label}…` : label}
        </span>
        <Badge
          variant="secondary"
          size="sm"
          className={cn("ml-auto font-mono", status === "approval" && "text-amber-700")}
        >
          {part.name}
        </Badge>
      </div>
      {status === "approval" && (
        <div className="mt-2 flex items-center gap-2">
          <Button type="button" size="sm" onClick={() => onApprovalResponse?.(true)}>
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onApprovalResponse?.(false)}
          >
            Deny
          </Button>
        </div>
      )}
      {status === "denied" && <div className="mt-2 text-red-600">Denied</div>}
      {status === "error" && (
        <div className="mt-2 text-red-600">{result?.error ?? "Tool call failed"}</div>
      )}
    </div>
  );
};

export { AgentToolCallCard };
export type { ToolCallPart, ToolResultPart };
