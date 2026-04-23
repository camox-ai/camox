import { queryKeys } from "@camox/api-contract/query-keys";
import { Button } from "@camox/ui/button";
import { PanelContent, PanelHeader } from "@camox/ui/panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@camox/ui/tooltip";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useSelector } from "@xstate/store/react";
import { Info } from "lucide-react";
import * as React from "react";

import { getApiClient } from "@/lib/api-client";
import { useIsAuthenticated, useProjectSlug } from "@/lib/auth";
import { NormalizedDataProvider, seedBlockCaches, usePageBlocks } from "@/lib/normalized-data";
import { blockQueries, pageQueries, projectQueries } from "@/lib/queries";
import { formatPathSegment } from "@/lib/utils";

import { type Action, actionsStore } from "../provider/actionsStore";
import { useCamoxApp } from "../provider/components/CamoxAppContext";
import { Navbar } from "../studio/components/Navbar";
import { AddBlockSheet } from "./components/AddBlockSheet";
import { AgentChatSheet } from "./components/AgentChatSheet";
import { BlockErrorBoundary } from "./components/BlockErrorBoundary";
import { CreatePageModal } from "./components/CreatePageModal";
import { EditPageModal } from "./components/EditPageModal";
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
 * Fetches the current page being previewed, with live updates for authenticated users.
 * Also will switch to peeked page data if there is one.
 *
 * Data for the current route is guaranteed in queryClient cache from the loader's
 * ensureQueryData. Live updates are gated by useProjectRoom only running in
 * AuthenticatedCamoxProvider — unauthenticated users get SSR data that never refetches.
 */
/**
 * Lightweight queryFn for client-side refetches — only fetches structural data.
 * Used after initial SSR load when block caches are already populated.
 */
function pageStructureQueryFn(path: string, projectSlug: string) {
  return () => getApiClient().pages.getStructure({ path, projectSlug });
}

/**
 * Full queryFn that fetches all page data and seeds block caches.
 * Used for peeked pages where block caches may not be populated yet.
 */
function pageFullQueryFn(
  queryClient: ReturnType<typeof useQueryClient>,
  path: string,
  projectSlug: string,
) {
  return async () => {
    const data = await getApiClient().pages.getByPath({ path, projectSlug });
    seedBlockCaches(queryClient, data);
    return { page: data.page, layout: data.layout, projectName: data.projectName };
  };
}

export function usePreviewedPage() {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const projectSlug = useProjectSlug();
  const peekedPagePathname = useSelector(previewStore, (state) => state.context.peekedPagePathname);

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

  // Current page: SSR loader seeds block caches on first load.
  // Client-side refetches (after invalidation) use the lightweight endpoint.
  const { data: currentPage } = useSuspenseQuery({
    queryKey: queryKeys.pages.getByPath(pathname),
    queryFn: pageStructureQueryFn(pathname, projectSlug),
    staleTime: Infinity,
  });

  // Peeked page: uses full endpoint to seed block caches on first fetch,
  // since those blocks may not be in cache yet.
  const isAuthenticated = useIsAuthenticated();
  const { data: peekedPage } = useQuery({
    queryKey: queryKeys.pages.getByPath(peekedPagePathname ?? ""),
    queryFn: pageFullQueryFn(queryClient, peekedPagePathname ?? "", projectSlug),
    enabled: isAuthenticated && !!peekedPagePathname,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });

  return peekedPagePathname ? (peekedPage ?? currentPage) : currentPage;
}

/* -------------------------------------------------------------------------------------------------
 * BlockRenderer — subscribes to individual block cache for granular re-renders
 * -----------------------------------------------------------------------------------------------*/

const BlockRenderer = ({
  blockId,
  mode,
  showAddBlockTop,
  showAddBlockBottom,
}: {
  blockId: number;
  mode: "site" | "peek" | "layout";
  showAddBlockTop: boolean;
  showAddBlockBottom: boolean;
}) => {
  const { data } = useSuspenseQuery(blockQueries.get(blockId));
  const camoxApp = useCamoxApp();
  const blockDef = camoxApp.getBlockById(data.block.type);

  if (!blockDef) return null;

  return (
    <NormalizedDataProvider files={data.files} repeatableItems={data.repeatableItems}>
      <blockDef._internal.Component
        blockData={{
          _id: data.block.id,
          type: data.block.type,
          content: data.block.content as Record<string, unknown>,
          settings: data.block.settings as Record<string, unknown> | undefined,
          position: String(data.block.position),
        }}
        mode={mode}
        showAddBlockTop={showAddBlockTop}
        showAddBlockBottom={showAddBlockBottom}
      />
    </NormalizedDataProvider>
  );
};

/* -------------------------------------------------------------------------------------------------
 * PageContent
 * -----------------------------------------------------------------------------------------------*/

export const PageContent = () => {
  const pageData = usePreviewedPage();
  const { pageBlocks, beforeBlocks, afterBlocks, layoutFiles, layoutItems } =
    usePageBlocks(pageData);
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
      return pageBlocks.length; // Insert at the end
    }

    // Find the index after the block with the matching position
    const afterBlockIndex = pageBlocks.findIndex(
      (block) => String(block.position) === effectivePosition,
    );

    if (afterBlockIndex === -1) {
      // Position not found, insert at the end
      return pageBlocks.length;
    }

    // Insert after the found block
    return afterBlockIndex + 1;
  }, [pageBlocks, effectivePosition]);

  // Look up layout
  const layout = pageData.layout ? camoxApp.getLayoutById(pageData.layout.layoutId) : undefined;

  // Build layout block data map by type
  const layoutBlocksMap = React.useMemo(() => {
    if (!pageData.layout) return null;
    const allLayoutBlocks = [...beforeBlocks, ...afterBlocks];
    const blocks: Record<
      string,
      {
        _id: number;
        type: string;
        content: Record<string, unknown>;
        settings?: Record<string, unknown>;
        position: string;
      }
    > = {};
    for (const block of allLayoutBlocks) {
      blocks[block.type] = {
        _id: block.id,
        type: block.type,
        content: block.content as Record<string, unknown>,
        settings: block.settings as Record<string, unknown> | undefined,
        position: String(block.position),
      };
    }
    return blocks;
  }, [pageData.layout, beforeBlocks, afterBlocks]);

  const pageBlocksContent = (
    <>
      {/* Render peeked block at the beginning if it should be before the first block */}
      {peekedBlockIndex === 0 && pageBlocks.length > 0 && (
        <PeekedBlock onExitComplete={onExitComplete} />
      )}
      {pageBlocks.map((blockData, index) => (
        <React.Fragment key={blockData.id}>
          <BlockErrorBoundary blockId={blockData.id} blockType={blockData.type}>
            <BlockRenderer
              blockId={blockData.id}
              mode="site"
              showAddBlockTop={
                index === 0
                  ? (layout?._internal.blockDefinitions.some((b) => b.placement === "before") ??
                    false)
                  : true
              }
              showAddBlockBottom={true}
            />
          </BlockErrorBoundary>
          {/* Render peeked block after this block if this is the insertion point */}
          {index === peekedBlockIndex - 1 && <PeekedBlock onExitComplete={onExitComplete} />}
        </React.Fragment>
      ))}
      {/* Render peeked block at the end if there are no blocks */}
      {pageBlocks.length === 0 && <PeekedBlock onExitComplete={onExitComplete} />}
    </>
  );

  if (layout && layoutBlocksMap) {
    const LayoutComponent = layout._internal.component;
    return (
      <NormalizedDataProvider files={layoutFiles} repeatableItems={layoutItems}>
        <layout._internal.Provider layoutBlocks={layoutBlocksMap}>
          <LayoutComponent>{pageBlocksContent}</LayoutComponent>
        </layout._internal.Provider>
      </NormalizedDataProvider>
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
  const pageData = usePreviewedPage();

  React.useEffect(() => {
    const actions = [
      {
        id: "enter-presentation-mode",
        label: "Hide Camox Studio",
        groupLabel: "Preview",
        checkIfAvailable: () => isAuthenticated && !isPresentationMode,
        execute: () => previewStore.send({ type: "enterPresentationMode" }),
        shortcut: { key: "Enter", withMeta: true },
      },
      {
        id: "exit-presentation-mode",
        label: "",
        groupLabel: "Preview",
        checkIfAvailable: () => isAuthenticated && isPresentationMode,
        execute: () => previewStore.send({ type: "exitPresentationMode" }),
        shortcut: { key: "Enter", withMeta: true },
      },
      {
        id: "clear-selection",
        label: "Clear selection",
        groupLabel: "Preview",
        checkIfAvailable: () => true,
        execute: () => {
          console.log("clear selection");
        },
        shortcut: { key: "Escape" },
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
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        previewStore.send({ type: "openEditPageModal", pageId: pageData.page.id })
                      }
                    />
                  }
                >
                  <Info className="text-muted-foreground size-4" />
                </TooltipTrigger>
                <TooltipContent>Page metadata, SEO and markdown</TooltipContent>
              </Tooltip>
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
      <CreatePageModal />
      <EditPageModal />
    </div>
  );
};

export function usePreviewPagesActions() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const projectSlug = useProjectSlug();
  const { data: project } = useQuery(projectQueries.getBySlug(projectSlug));
  const { data: pages } = useQuery({
    ...pageQueries.list(project?.id ?? 0),
    enabled: !!project,
  });

  React.useEffect(() => {
    const GO_TO_PAGE_ID = "go-to-page";
    const currentPage = pages?.find((p) => p.fullPath === pathname);

    const actions: Action[] = [
      {
        id: "create-page",
        label: "Create page",
        groupLabel: "Preview",
        checkIfAvailable: () => true,
        execute: () => previewStore.send({ type: "openCreatePageModal" }),
      },
      {
        id: "edit-current-page",
        label: "Edit current page",
        groupLabel: "Preview",
        checkIfAvailable: () => !!currentPage,
        execute: () => {
          if (!currentPage) return;
          previewStore.send({
            type: "openEditPageModal",
            pageId: currentPage.id,
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
