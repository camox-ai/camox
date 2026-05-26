import { Alert, AlertDescription, AlertTitle } from "@camox/ui/alert";
import { Button } from "@camox/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useSelector } from "@xstate/store-react";
import { Info, Lock, Plus, X } from "lucide-react";
import * as React from "react";

import { useProjectSlug } from "@/lib/auth";
import { projectQueries } from "@/lib/queries";

import { PreviewSideSheet, SheetParts } from "../../preview/components/PreviewSideSheet";
import { previewStore } from "../../preview/previewStore";
import { AgentChatThread } from "./AgentChatThread";

const AgentChatSheet = () => {
  const isOpen = useSelector(previewStore, (state) => state.context.isAgentChatSheetOpen);
  const previewSource = useSelector(previewStore, (state) => state.context.previewSource);
  const [agentChatKey, setAgentChatKey] = React.useState(0);
  const [composerFocusKey, setComposerFocusKey] = React.useState(0);
  const { pathname } = useLocation();
  const projectSlug = useProjectSlug();
  const { data: project } = useQuery(projectQueries.getBySlug(projectSlug));
  const isLiveSource = previewSource === "live";

  React.useEffect(() => {
    if (!isOpen) return;
    setComposerFocusKey((key) => key + 1);
  }, [isOpen]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      previewStore.send({ type: "closeAgentChatSheet" });
    }
  };

  return (
    <PreviewSideSheet
      open={isOpen}
      onOpenChange={handleOpenChange}
      keepMounted
      showCloseButton={false}
      initialFocus={false}
    >
      <SheetParts.SheetHeader className="gap-4 pb-0">
        <div className="flex items-center gap-1">
          <SheetParts.SheetTitle className="flex-1">Agent Chat</SheetParts.SheetTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Start a new Agent Chat"
            onClick={() => {
              setAgentChatKey((key) => key + 1);
              setComposerFocusKey((key) => key + 1);
            }}
          >
            <Plus className="size-4" />
          </Button>
          <SheetParts.SheetClose
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close" />}
          >
            <X className="size-4" />
          </SheetParts.SheetClose>
        </div>
        <Alert>
          <Info className="size-4" />
          <AlertTitle>Camox is most powerful in your coding agent</AlertTitle>
          <AlertDescription>
            Use Claude Code or Codex to manage your site with both code and content access.
          </AlertDescription>
        </Alert>
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
          <AgentChatThread
            key={agentChatKey}
            projectId={project.id}
            currentPath={pathname}
            source={previewSource}
            focusKey={composerFocusKey}
          />
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
