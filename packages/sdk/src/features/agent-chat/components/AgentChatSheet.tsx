import { Alert, AlertDescription, AlertTitle } from "@camox/ui/alert";
import { Button } from "@camox/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useSelector } from "@xstate/store-react";
import { Lock } from "lucide-react";

import { useProjectSlug } from "@/lib/auth";
import { projectQueries } from "@/lib/queries";

import { PreviewSideSheet, SheetParts } from "../../preview/components/PreviewSideSheet";
import { previewStore } from "../../preview/previewStore";
import { AgentChatThread } from "./AgentChatThread";

const AgentChatSheet = () => {
  const isOpen = useSelector(previewStore, (state) => state.context.isAgentChatSheetOpen);
  const previewSource = useSelector(previewStore, (state) => state.context.previewSource);
  const { pathname } = useLocation();
  const projectSlug = useProjectSlug();
  const { data: project } = useQuery(projectQueries.getBySlug(projectSlug));
  const isLiveSource = previewSource === "live";

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      previewStore.send({ type: "closeAgentChatSheet" });
    }
  };

  return (
    <PreviewSideSheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetParts.SheetHeader>
        <SheetParts.SheetTitle>Agent Chat</SheetParts.SheetTitle>
        <SheetParts.SheetDescription>
          Ask Camox to inspect or update the current page.
        </SheetParts.SheetDescription>
      </SheetParts.SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col">
        {isLiveSource && (
          <div className="p-4 pb-0">
            <Alert>
              <Lock className="size-4" />
              <AlertTitle>Live Source is read-only</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  Agent Chat can inspect live content, but edits require switching to Draft Source.
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => previewStore.send({ type: "setPreviewSource", source: "draft" })}
                >
                  Switch to draft
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        )}
        {project ? (
          <AgentChatThread projectId={project.id} currentPath={pathname} source={previewSource} />
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-sm">
            Loading project…
          </div>
        )}
      </div>
    </PreviewSideSheet>
  );
};

export { AgentChatSheet };
