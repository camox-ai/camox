import { useSelector } from "@xstate/store-react";

import { CMS_SIDEBAR_WIDTH } from "../previewConstants";
import { previewStore } from "../previewStore";
import { AddBlockSidebar } from "./AddBlockSidebar";
import { PageNavigatorSidebar, type PreviewedPage } from "./PageNavigatorSidebar";

type LeftSidebarRoute = { type: "add-block" } | { type: "page-navigator" };

const getLeftSidebarRoute = ({
  isAddBlockSidebarOpen,
}: {
  isAddBlockSidebarOpen: boolean;
}): LeftSidebarRoute => {
  if (isAddBlockSidebarOpen) {
    return { type: "add-block" };
  }

  return { type: "page-navigator" };
};

const LeftSidebar = ({ page }: { page: PreviewedPage }) => {
  const isAddBlockSidebarOpen = useSelector(
    previewStore,
    (state) => state.context.isAddBlockSidebarOpen,
  );
  const route = getLeftSidebarRoute({ isAddBlockSidebarOpen });

  return (
    <aside className="flex shrink-0 flex-col border-r-2" style={{ width: CMS_SIDEBAR_WIDTH }}>
      {route.type === "add-block" && <AddBlockSidebar />}
      {route.type === "page-navigator" && <PageNavigatorSidebar page={page} />}
    </aside>
  );
};

export { LeftSidebar };
