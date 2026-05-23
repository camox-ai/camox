import { Badge } from "@camox/ui/badge";
import { CheckCircle2, Loader2, Wrench, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

import { getToolLabel } from "../agent-chat-labels";

type ToolCallPart = {
  type: "tool-call";
  id: string;
  name: string;
  state: string;
  arguments?: string;
  output?: unknown;
  approval?: { id: string; needsApproval: boolean; approved?: boolean };
};

function getStatus(part: ToolCallPart) {
  if (part.approval?.needsApproval && part.approval.approved === undefined) return "approval";
  if (part.state === "complete") return "complete";
  if (part.state === "approval-responded") return "complete";
  return "running";
}

const AgentToolCallCard = ({ part }: { part: ToolCallPart }) => {
  const status = getStatus(part);
  const label = getToolLabel(part.name);

  return (
    <div className="bg-muted/50 text-muted-foreground my-2 rounded-md border p-2 text-xs">
      <div className="flex items-center gap-2">
        {status === "running" && <Loader2 className="size-3 animate-spin" />}
        {status === "complete" && <CheckCircle2 className="size-3 text-green-600" />}
        {status === "approval" && <Wrench className="size-3" />}
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
      {part.approval?.approved === false && (
        <div className="mt-2 flex items-center gap-1 text-red-600">
          <XCircle className="size-3" /> Denied
        </div>
      )}
    </div>
  );
};

export { AgentToolCallCard };
export type { ToolCallPart };
