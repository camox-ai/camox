import { Alert, AlertDescription, AlertTitle } from "@camox/ui/alert";
import { useSelector } from "@xstate/store/react";
import { Info } from "lucide-react";

import { previewStore } from "../previewStore";
import { PreviewSideSheet, SheetParts } from "./PreviewSideSheet";

const AgentChatSheet = () => {
  const isOpen = useSelector(previewStore, (state) => state.context.isAgentChatSheetOpen);

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
          Describe the changes you'd like to make to this page.
        </SheetParts.SheetDescription>
      </SheetParts.SheetHeader>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <Alert>
          <Info className="size-4" />
          <AlertTitle>In-app agentic chat is coming soon</AlertTitle>
          <AlertDescription>
            You'll be able to describe changes right here without leaving the preview.
          </AlertDescription>
        </Alert>
        <div className="border-primary bg-primary/5 space-y-2 rounded-lg border-2 p-4">
          <p className="text-foreground text-sm font-medium">
            Edit your site from your coding agent
          </p>
          <p className="text-muted-foreground text-sm">
            Your app comes with a <strong>CLI</strong> and a set of <strong>Skills</strong> that let
            Claude Code, Cursor, or any other coding agent create pages, edit blocks, and update
            layouts directly.
          </p>
          <p className="text-muted-foreground text-sm">
            Your agent has the ability to edit both the structure of blocks <em>and</em> their
            content, making it the most powerful way to manage your Camox website.
          </p>
        </div>
      </div>
    </PreviewSideSheet>
  );
};

export { AgentChatSheet };
