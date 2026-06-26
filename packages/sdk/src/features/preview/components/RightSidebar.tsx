import { useSelector } from "@xstate/store-react";

import { AgentChatSidebar } from "../../agent-chat/components/AgentChatSidebar";
import { CMS_SIDEBAR_WIDTH } from "../previewConstants";
import { previewStore, selectionBlockId } from "../previewStore";
import { PageEditorSidebar } from "./PageEditorSidebar";
import { PageInfoSidebar } from "./PageInfoSidebar";

type RightSidebarRoute =
  | { type: "agent-chat" }
  | { type: "page-info"; pageId: number }
  | { type: "page-editor" };

const getRightSidebarRoute = ({
  pageId,
  selectedBlockId,
  isAgentChatSidebarOpen,
}: {
  pageId: number;
  selectedBlockId: number | null;
  isAgentChatSidebarOpen: boolean;
}): RightSidebarRoute => {
  if (isAgentChatSidebarOpen) return { type: "agent-chat" };

  if (selectedBlockId == null) {
    return { type: "page-info", pageId };
  }

  return { type: "page-editor" };
};

const RightSidebar = ({ pageId }: { pageId: number }) => {
  const selection = useSelector(previewStore, (state) => state.context.selection);
  const isAgentChatSidebarOpen = useSelector(
    previewStore,
    (state) => state.context.isAgentChatSidebarOpen,
  );
  const isAddBlockSidebarOpen = useSelector(
    previewStore,
    (state) => state.context.isAddBlockSidebarOpen,
  );
  const route = getRightSidebarRoute({
    pageId,
    selectedBlockId: selectionBlockId(selection),
    isAgentChatSidebarOpen,
  });

  return (
    <aside
      className="bg-background relative flex shrink-0 flex-col border-l-2"
      style={{ width: CMS_SIDEBAR_WIDTH }}
    >
      {route.type === "agent-chat" && <AgentChatSidebar />}
      {route.type === "page-info" && <PageInfoSidebar pageId={route.pageId} />}
      {route.type === "page-editor" && <PageEditorSidebar />}
      {isAddBlockSidebarOpen && (
        <div
          className="absolute inset-0 z-20"
          style={{ background: "rgba(0, 0, 0, 0.66)" }}
          onClick={() => previewStore.send({ type: "closeAddBlockSidebar" })}
        />
      )}
    </aside>
  );
};

export { RightSidebar };
