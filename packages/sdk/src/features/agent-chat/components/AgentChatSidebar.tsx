import { Alert, AlertDescription, AlertTitle } from "@camox/ui/alert";
import { Button } from "@camox/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useSelector } from "@xstate/store-react";
import { Lock, Plus, X } from "lucide-react";
import * as React from "react";

import { useProjectSlug } from "@/lib/auth";
import { projectQueries } from "@/lib/queries";

import { previewStore } from "../../preview/previewStore";
import { AgentChatThread } from "./AgentChatThread";

const AgentChatSidebar = () => {
  const previewSource = useSelector(previewStore, (state) => state.context.previewSource);
  const pageScaffoldContext = useSelector(
    previewStore,
    (state) => state.context.agentChatPageScaffoldContext,
  );
  const [agentChatKey, setAgentChatKey] = React.useState(0);
  const [composerFocusKey, setComposerFocusKey] = React.useState(0);
  const { pathname } = useLocation();
  const projectSlug = useProjectSlug();
  const { data: project } = useQuery(projectQueries.getBySlug(projectSlug));
  const isLiveSource = previewSource === "live";

  React.useEffect(() => {
    setComposerFocusKey((key) => key + 1);
  }, []);

  return (
    <>
      <div className="flex items-center gap-1 p-2">
        <p className="flex-1 text-base font-semibold">Agent Chat</p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Start a new Agent Chat"
          onClick={() => {
            previewStore.send({ type: "clearAgentChatPageScaffoldContext" });
            setAgentChatKey((key) => key + 1);
            setComposerFocusKey((key) => key + 1);
          }}
        >
          <Plus className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close"
          onClick={() => previewStore.send({ type: "closeAgentChatSidebar" })}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {isLiveSource && (
          <div className="p-2 pb-0">
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
            key={`${agentChatKey}:${pageScaffoldContext?.id ?? 0}`}
            projectId={project.id}
            currentPath={pathname}
            source={previewSource}
            focusKey={composerFocusKey}
            pageScaffoldContext={pageScaffoldContext ?? undefined}
          />
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-sm">
            Loading project…
          </div>
        )}
      </div>
    </>
  );
};

export { AgentChatSidebar };
