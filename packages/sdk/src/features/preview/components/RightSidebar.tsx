import { useSelector } from "@xstate/store-react";

import { CMS_SIDEBAR_WIDTH } from "../previewConstants";
import { previewStore, selectionBlockId } from "../previewStore";
import { PageEditorSidebar } from "./PageEditorSidebar";
import { PageInfoSidebar } from "./PageInfoSidebar";

type RightSidebarRoute = { type: "page-info"; pageId: number } | { type: "page-editor" };

const getRightSidebarRoute = ({
  pageId,
  selectedBlockId,
}: {
  pageId: number;
  selectedBlockId: number | null;
}): RightSidebarRoute => {
  if (selectedBlockId == null) {
    return { type: "page-info", pageId };
  }

  return { type: "page-editor" };
};

const RightSidebar = ({ pageId }: { pageId: number }) => {
  const selection = useSelector(previewStore, (state) => state.context.selection);
  const route = getRightSidebarRoute({
    pageId,
    selectedBlockId: selectionBlockId(selection),
  });

  return (
    <aside
      className="bg-background flex shrink-0 flex-col border-l-2"
      style={{ width: CMS_SIDEBAR_WIDTH }}
    >
      {route.type === "page-info" && <PageInfoSidebar pageId={route.pageId} />}
      {route.type === "page-editor" && <PageEditorSidebar />}
    </aside>
  );
};

export { RightSidebar };
