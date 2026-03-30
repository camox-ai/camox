import { PanelContent, PanelHeader } from "@camox/ui/panel";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useSelector } from "@xstate/store/react";
import * as React from "react";

import { useIsAuthenticated } from "@/lib/auth";
import type { PageWithBlocks } from "@/lib/queries";
import { pageQueries } from "@/lib/queries";
import { formatPathSegment } from "@/lib/utils";

import { type Action, actionsStore } from "../provider/actionsStore";
import { useCamoxApp } from "../provider/components/CamoxAppContext";
import { Navbar } from "../studio/components/Navbar";
import { AddBlockSheet } from "./components/AddBlockSheet";
import { AgentChatSheet } from "./components/AgentChatSheet";
import { CreatePageSheet } from "./components/CreatePageSheet";
import { EditPageSheet } from "./components/EditPageSheet";
import { PageContentSheet } from "./components/PageContentSheet";
import { PagePicker } from "./components/PagePicker";
import { PageTree } from "./components/PageTree";
import { PeekedBlock } from "./components/PeekedBlock";
import { PreviewFrame, PreviewPanel } from "./components/PreviewPanel";
import { previewStore } from "./previewStore";

/* -------------------------------------------------------------------------------------------------
 * PageContent
 * -----------------------------------------------------------------------------------------------*/

/**
 * Fetches the current page being previewed, with live updates if the user is signed in.
 * Also will switch to peeked page data if there is one.
 */
export function usePreviewedPage() {
  const { pathname } = useLocation();
  const peekedPagePathname = useSelector(previewStore, (state) => state.context.peekedPagePathname);
  const pagePathnameToFetch = peekedPagePathname ?? pathname;

  // When the actual route changes, clear any stale peeked page so it doesn't
  // override the new pathname. This handles the race condition where the
  // PagePicker's Command `onValueChange` fires after `clearPeekedPage`.
  const prevPathnameRef = React.useRef(pathname);
  React.useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      previewStore.send({ type: "clearPeekedPage" });
    }
  }, [pathname]);

  /**
   * Only fetch the page data if the user is signed in (i.e. an admin)
   * to avoid unnecessary load on the backend and layout shifts for regular visitors.
   */
  const isAuthenticated = useIsAuthenticated();
  const { data: currentPage } = useQuery({
    ...pageQueries.getByPath(pagePathnameToFetch),
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
  });

  return currentPage;
}

interface PageContentProps {
  page: PageWithBlocks;
}

export const PageContent = ({ page: initialPageData }: PageContentProps) => {
  const livePageData = usePreviewedPage();
  const pageData = livePageData ?? initialPageData;
  const peekedBlockPosition = useSelector(
    previewStore,
    (state) => state.context.peekedBlockPosition,
  );

  // Latch the last non-null position so the block doesn't jump during collapse
  const displayedPositionRef = React.useRef<string | null>(null);
  if (peekedBlockPosition !== null) {
    displayedPositionRef.current = peekedBlockPosition;
  }
  const effectivePosition = peekedBlockPosition ?? displayedPositionRef.current;

  const onExitComplete = React.useCallback(() => {
    displayedPositionRef.current = null;
  }, []);

  const camoxApp = useCamoxApp();

  // Find the index where the peeked block should be inserted
  // If effectivePosition is null, insert at the end
  // If effectivePosition is "", insert at the beginning
  const peekedBlockIndex = React.useMemo(() => {
    if (effectivePosition === "") {
      return 0; // Insert at the beginning
    }

    if (effectivePosition === null) {
      return pageData.blocks.length; // Insert at the end
    }

    // Find the index after the block with the matching position
    const afterBlockIndex = pageData.blocks.findIndex(
      (block) => String(block.position) === effectivePosition,
    );

    if (afterBlockIndex === -1) {
      // Position not found, insert at the end
      return pageData.blocks.length;
    }

    // Insert after the found block
    return afterBlockIndex + 1;
  }, [pageData.blocks, effectivePosition]);

  // Look up layout
  const layout = pageData.layout ? camoxApp.getLayoutById(pageData.layout.layoutId) : undefined;

  // Build layout block data map by type
  const layoutBlocks = React.useMemo(() => {
    if (!pageData.layout) return null;
    const blocks: Record<
      string,
      {
        _id: string;
        type: string;
        content: Record<string, unknown>;
        settings?: Record<string, unknown>;
        position: string;
      }
    > = {};
    for (const block of pageData.layout.blocks) {
      blocks[block.type] = {
        _id: String(block.id),
        type: block.type,
        content: block.content as Record<string, unknown>,
        settings: block.settings as Record<string, unknown> | undefined,
        position: String(block.position),
      };
    }
    return blocks;
  }, [pageData.layout]);

  const pageBlocksContent = (
    <>
      {/* Render peeked block at the beginning if it should be before the first block */}
      {peekedBlockIndex === 0 && pageData.blocks.length > 0 && (
        <PeekedBlock onExitComplete={onExitComplete} />
      )}
      {pageData.blocks.map((blockData, index) => {
        const block = camoxApp.getBlockById(String(blockData.type));

        if (!block) {
          return null;
        }

        return (
          <React.Fragment key={blockData.id}>
            <block.Component
              blockData={{
                _id: String(blockData.id) as any,
                type: blockData.type,
                content: blockData.content as Record<string, unknown>,
                settings: blockData.settings as Record<string, unknown> | undefined,
                position: String(blockData.position),
              }}
              mode="site"
              showAddBlockTop={
                index === 0
                  ? (layout?.blockDefinitions.some((b) => b.placement === "before") ?? false)
                  : true
              }
              showAddBlockBottom={true}
            />
            {/* Render peeked block after this block if this is the insertion point */}
            {index === peekedBlockIndex - 1 && <PeekedBlock onExitComplete={onExitComplete} />}
          </React.Fragment>
        );
      })}
      {/* Render peeked block at the end if there are no blocks */}
      {pageData.blocks.length === 0 && <PeekedBlock onExitComplete={onExitComplete} />}
    </>
  );

  if (layout && layoutBlocks) {
    const LayoutComponent = layout.component;
    return (
      <layout.Provider layoutBlocks={layoutBlocks}>
        <LayoutComponent>{pageBlocksContent}</LayoutComponent>
      </layout.Provider>
    );
  }

  return <main className="flex min-h-screen flex-col">{pageBlocksContent}</main>;
};

/* -------------------------------------------------------------------------------------------------
 * CamoxPreview
 * -----------------------------------------------------------------------------------------------*/

export const CamoxPreview = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useIsAuthenticated();
  const isPresentationMode = useSelector(previewStore, (state) => state.context.isPresentationMode);
  const isSidebarOpen = useSelector(previewStore, (state) => state.context.isSidebarOpen);

  React.useEffect(() => {
    const actions = [
      {
        id: "enter-presentation-mode",
        label: "Enter presentation mode",
        groupLabel: "Preview",
        checkIfAvailable: () => isAuthenticated && !isPresentationMode,
        execute: () => previewStore.send({ type: "enterPresentationMode" }),
        shortcut: { key: "Enter", withMeta: true },
        icon: "MonitorPlay",
      },
      {
        id: "exit-presentation-mode",
        label: "Exit presentation mode",
        groupLabel: "Preview",
        checkIfAvailable: () => isAuthenticated && isPresentationMode,
        execute: () => previewStore.send({ type: "exitPresentationMode" }),
        shortcut: { key: "Escape", withMeta: true },
        icon: "MonitorOff",
      },
    ] satisfies Action[];

    actionsStore.send({
      type: "registerManyActions",
      actions,
    });

    return () => {
      actionsStore.send({
        type: "unregisterManyActions",
        ids: actions.map((a) => a.id),
      });
    };
  }, [isPresentationMode, isAuthenticated]);

  if (isPresentationMode) {
    return <PreviewFrame className="h-screen w-full">{children}</PreviewFrame>;
  }

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="bg-background flex h-screen flex-col overflow-hidden">
      <Navbar />
      <div className="flex h-full flex-row items-stretch">
        {isSidebarOpen && (
          <div className="flex w-[300px] flex-col border-r-2">
            <PanelHeader className="flew-row flex gap-2 px-2 py-2">
              <PagePicker />
            </PanelHeader>
            <PanelContent className="flex grow basis-0 flex-col gap-2 overflow-auto p-2">
              <PageTree />
            </PanelContent>
          </div>
        )}
        <PreviewPanel>
          {children}
          {!isPresentationMode && isAuthenticated && (
            <div style={{ height: "80px", background: "transparent" }} />
          )}
        </PreviewPanel>
      </div>
      <PageContentSheet />
      <AddBlockSheet />
      <AgentChatSheet />
      <CreatePageSheet />
      <EditPageSheet />
    </div>
  );
};

export function usePreviewPagesActions() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: pages } = useQuery(pageQueries.list());

  React.useEffect(() => {
    const GO_TO_PAGE_ID = "go-to-page";
    const currentPage = pages?.find((p) => p.fullPath === pathname);

    const actions: Action[] = [
      {
        id: "create-page",
        label: "Create page",
        groupLabel: "Preview",
        icon: "FilePlus",
        checkIfAvailable: () => true,
        execute: () => previewStore.send({ type: "openCreatePageSheet" }),
      },
      {
        id: "edit-current-page",
        label: "Edit current page",
        groupLabel: "Preview",
        icon: "Pencil",
        checkIfAvailable: () => !!currentPage,
        execute: () => {
          if (!currentPage) return;
          previewStore.send({
            type: "openEditPageSheet",
            page: currentPage,
          });
        },
      },
      {
        id: GO_TO_PAGE_ID,
        label: "Go to page",
        groupLabel: "Preview",
        checkIfAvailable: () => !!pages,
        hasChildren: true,
        execute: () => {},
        icon: "File",
      },
      // One action per page
      ...(pages
        ? pages.map(
            (page) =>
              ({
                id: `go-to-page-${page.id}`,
                parentActionId: GO_TO_PAGE_ID,
                label: `Go to "${page.metaTitle ?? formatPathSegment(page.pathSegment)}"`,
                groupLabel: "Preview",
                checkIfAvailable: () => true,
                execute: () => navigate({ to: page.fullPath }),
                icon: "File",
              }) as Action,
          )
        : []),
    ];

    actionsStore.send({
      type: "registerManyActions",
      actions,
    });

    return () => {
      actionsStore.send({
        type: "unregisterManyActions",
        ids: actions.map((a) => a.id),
      });
    };
  }, [navigate, pages, pathname]);
}
