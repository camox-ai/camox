import { queryKeys, type ReadSource } from "@camox/api-contract/query-keys";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@camox/ui/alert-dialog";
import { Button } from "@camox/ui/button";
import { ButtonGroup } from "@camox/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@camox/ui/dropdown-menu";
import { Label } from "@camox/ui/label";
import { PanelContent, PanelHeader } from "@camox/ui/panel";
import { Switch } from "@camox/ui/switch";
import { toast } from "@camox/ui/toaster";
import { Tooltip, TooltipContent, TooltipTrigger } from "@camox/ui/tooltip";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useSelector } from "@xstate/store-react";
import { Info, MoreHorizontal } from "lucide-react";
import * as React from "react";

import { getApiClient } from "@/lib/api-client";
import { useIsAuthenticated, useProjectSlug } from "@/lib/auth";
import { NormalizedDataProvider, seedBlockCaches, usePageBlocks } from "@/lib/normalized-data";
import {
  blockQueries,
  type Page,
  pageMutations,
  pageQueries,
  type PageStructure,
  projectQueries,
} from "@/lib/queries";
import { trackClientEvent } from "@/lib/telemetry-client";
import { cn } from "@/lib/utils";

import { AgentChatSheet } from "../agent-chat/components/AgentChatSheet";
import { type Action, actionsStore } from "../provider/actionsStore";
import { useCamoxApp } from "../provider/components/CamoxAppContext";
import { Navbar } from "../studio/components/Navbar";
import { AddBlockSheet } from "./components/AddBlockSheet";
import { BlockErrorBoundary } from "./components/BlockErrorBoundary";
import { CreatePageModal } from "./components/CreatePageModal";
import { DraftSwitchDialog } from "./components/DraftSwitchDialog";
import { PageContentSheet } from "./components/PageContentSheet";
import { PageMetadataModal } from "./components/PageMetadataModal";
import { PagePicker } from "./components/PagePicker";
import { PageTree } from "./components/PageTree";
import { PeekedBlock } from "./components/PeekedBlock";
import { PreviewFrame, PreviewPanel } from "./components/PreviewPanel";
import { PublishDialog } from "./components/PublishDialog";
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
 *
 * Source is threaded from the studio's source select (previewStore). Each
 * source has its own cache slot, so toggling Draft↔Live is instant once both
 * have been seeded. Public visitors never invalidate (no project room) so
 * this query function doesn't run for them — they stay on the SSR-seeded
 * 'live' data.
 */
function pageStructureQueryFn(path: string, projectSlug: string, source: ReadSource) {
  return () => getApiClient().pages.getStructure({ path, projectSlug, source });
}

/**
 * Full queryFn that fetches all page data and seeds block caches.
 * Used for peeked pages where block caches may not be populated yet.
 */
function pageFullQueryFn(
  queryClient: ReturnType<typeof useQueryClient>,
  path: string,
  projectSlug: string,
  source: ReadSource,
) {
  return async () => {
    const data = await getApiClient().pages.getByPath({ path, projectSlug, source });
    seedBlockCaches(queryClient, data, source);
    return {
      page: data.page,
      layout: data.layout,
      projectName: data.projectName,
      project: data.project,
    };
  };
}

export function usePreviewedPage() {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const projectSlug = useProjectSlug();
  const peekedPagePathname = useSelector(previewStore, (state) => state.context.peekedPagePathname);
  const previewSource = useSelector(previewStore, (state) => state.context.previewSource);

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

  // Current page: SSR loader seeds block caches on first load (both 'live'
  // and 'draft' slots, so the studio's default 'draft' view has data even
  // before the first edit). Client-side refetches (after invalidation) use
  // the lightweight endpoint.
  const { data: currentPage } = useSuspenseQuery({
    queryKey: queryKeys.pages.getByPath(pathname, previewSource),
    queryFn: pageStructureQueryFn(pathname, projectSlug, previewSource),
    staleTime: Infinity,
  });

  // Peeked page: uses full endpoint to seed block caches on first fetch,
  // since those blocks may not be in cache yet.
  const isAuthenticated = useIsAuthenticated();
  const { data: peekedPage } = useQuery({
    queryKey: queryKeys.pages.getByPath(peekedPagePathname ?? "", previewSource),
    queryFn: pageFullQueryFn(queryClient, peekedPagePathname ?? "", projectSlug, previewSource),
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
  const previewSource = useSelector(previewStore, (state) => state.context.previewSource);
  const { data } = useSuspenseQuery(blockQueries.get(blockId, previewSource));
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
  const previewSource = useSelector(previewStore, (state) => state.context.previewSource);
  const { pageBlocks, beforeBlocks, afterBlocks, layoutFiles, layoutItems } = usePageBlocks(
    pageData,
    previewSource,
  );
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
 * SidebarPublishRow — Draft / Live preview toggle + Publish… button
 * -------------------------------------------------------------------------------------------------
 * The switch chooses _what am I looking at_; the button promotes that draft
 * to public. Pairing them in the same row reflects that both operate on the
 * page currently in focus.
 * -----------------------------------------------------------------------------------------------*/

type PreviewedPage = {
  id: number;
  metaTitle: string | null;
  pathSegment: string;
  fullPath: string;
  livePublishedCheckpointId: number | null;
  status: "draft" | "published" | "modified";
  modifiedReason:
    | { reason: "self" }
    | { reason: "layout"; layoutId: number; layoutHandle: string; affectedPagesCount: number }
    | { reason: "both"; layoutId: number; layoutHandle: string; affectedPagesCount: number }
    | null;
};

const SidebarPublishRow = ({ page }: { page: PreviewedPage }) => {
  const previewSource = useSelector(previewStore, (state) => state.context.previewSource);
  const queryClient = useQueryClient();
  const projectSlug = useProjectSlug();
  const { pathname } = useLocation();
  const [isPublishDialogOpen, setIsPublishDialogOpen] = React.useState(false);
  const [isUnpublishDialogOpen, setIsUnpublishDialogOpen] = React.useState(false);
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = React.useState(false);
  const unpublishPage = useMutation(pageMutations.unpublish());
  const discardChanges = useMutation(pageMutations.discardChanges());

  // 'Live' isn't a valid preview target for a page that's never been
  // published — there's no snapshot to render. Disable rather than hide so
  // the control's position in the toolbar stays stable as the user
  // navigates between published and unpublished pages.
  const hasLiveCheckpoint = page.livePublishedCheckpointId != null;
  const isHomePage = page.fullPath === "/";

  // Warm the other source's cache on hover so the toggle feels instant. We
  // use the full query fn (rather than the lightweight structural one) so
  // block caches are seeded alongside the page row — that way a switch from
  // 'draft' to 'live' (or vice versa) doesn't Suspense on a missing block
  // cache. `staleTime: Infinity` on the queries means subsequent hovers are
  // no-ops once the data is in.
  const otherSource: ReadSource = previewSource === "draft" ? "live" : "draft";
  const canPrefetchOther = otherSource === "draft" || hasLiveCheckpoint;
  const prefetchOtherSource = React.useCallback(() => {
    if (!canPrefetchOther) return;
    void queryClient.prefetchQuery({
      queryKey: queryKeys.pages.getByPath(pathname, otherSource),
      queryFn: pageFullQueryFn(queryClient, pathname, projectSlug, otherSource),
      staleTime: Infinity,
    });
  }, [canPrefetchOther, otherSource, pathname, projectSlug, queryClient]);
  // Publish is gated on (a) there's something to publish and (b) the user is
  // looking at the draft. Publishing while previewing Live would mean
  // promoting the already-public snapshot to itself — meaningless, and the
  // mental model "you publish what you're looking at" only holds on Draft.
  const hasChangesToPublish = page.status === "draft" || page.status === "modified";
  const canPublish = hasChangesToPublish && previewSource === "draft";
  const canDiscardChanges = page.status === "modified";

  // The "Also publish layout" toggle is offered only when the layout is the
  // one (or one of the) reasons the page is modified. `'self'`-only modified
  // pages and clean published pages don't surface it — the layout has
  // nothing new to ship in those cases.
  const layoutCascade =
    page.modifiedReason &&
    (page.modifiedReason.reason === "layout" || page.modifiedReason.reason === "both")
      ? {
          layoutHandle: page.modifiedReason.layoutHandle,
          affectedPagesCount: page.modifiedReason.affectedPagesCount,
        }
      : null;

  // 'modified' means the page has been published before but has unpublished
  // edits; 'draft' means it's never been published. The button copy mirrors
  // that distinction so the user knows whether they're shipping the page for
  // the first time or pushing an update.
  const publishLabel = page.status === "modified" ? "Publish changes" : "Publish page";

  React.useEffect(() => {
    const actions: Action[] = [
      {
        id: "publish-current-page",
        label: publishLabel,
        groupLabel: "Preview",
        checkIfAvailable: () => canPublish,
        execute: () => setIsPublishDialogOpen(true),
      },
      {
        id: "unpublish-current-page",
        label: "Unpublish page",
        groupLabel: "Preview",
        checkIfAvailable: () => hasLiveCheckpoint && !isHomePage && !unpublishPage.isPending,
        execute: () => setIsUnpublishDialogOpen(true),
      },
      {
        id: "discard-current-page-changes",
        label: "Discard page changes",
        groupLabel: "Preview",
        checkIfAvailable: () => canDiscardChanges && !discardChanges.isPending,
        execute: () => setIsDiscardDialogOpen(true),
      },
    ];

    actionsStore.send({ type: "registerManyActions", actions });

    return () => {
      actionsStore.send({
        type: "unregisterManyActions",
        ids: actions.map((action) => action.id),
      });
    };
  }, [
    canDiscardChanges,
    canPublish,
    discardChanges.isPending,
    hasLiveCheckpoint,
    isHomePage,
    publishLabel,
    unpublishPage.isPending,
  ]);

  const handleUnpublish = async () => {
    if (isHomePage) return;

    try {
      await unpublishPage.mutateAsync({ id: page.id });
      queryClient.setQueryData<PageStructure>(
        queryKeys.pages.getByPath(pathname, "draft"),
        (current) =>
          current
            ? {
                ...current,
                page: {
                  ...current.page,
                  livePublishedCheckpointId: null,
                  status: "draft",
                  modifiedReason: null,
                },
              }
            : current,
      );
      queryClient.setQueryData<Page[]>(queryKeys.pages.list, (current) =>
        current?.map((item) =>
          item.id === page.id
            ? {
                ...item,
                livePublishedCheckpointId: null,
                status: "draft",
                modifiedReason: null,
              }
            : item,
        ),
      );
      previewStore.send({ type: "setPreviewSource", source: "draft" });
      trackClientEvent("page_unpublished", { pageId: page.id });
      toast.success("Unpublished this page");
      setIsUnpublishDialogOpen(false);
    } catch (error) {
      console.error("Failed to unpublish page:", error);
      toast.error("Could not unpublish this page");
    }
  };

  const handleDiscardChanges = async () => {
    try {
      await discardChanges.mutateAsync({ id: page.id });
      previewStore.send({ type: "setPreviewSource", source: "draft" });
      trackClientEvent("page_changes_discarded", { pageId: page.id });
      toast.success("Discarded draft changes");
      setIsDiscardDialogOpen(false);
    } catch (error) {
      console.error("Failed to discard page changes:", error);
      toast.error("Could not discard draft changes");
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <ButtonGroup className="w-full">
          <Button
            variant="outline"
            type="button"
            disabled={!canPublish}
            onClick={() => setIsPublishDialogOpen(true)}
            className="flex-1"
          >
            {publishLabel}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="More publish actions"
                />
              }
            >
              <MoreHorizontal className="text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-42">
              <DropdownMenuItem
                disabled={!hasLiveCheckpoint || isHomePage || unpublishPage.isPending}
                onClick={() => setIsUnpublishDialogOpen(true)}
              >
                Unpublish
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canDiscardChanges || discardChanges.isPending}
                onClick={() => setIsDiscardDialogOpen(true)}
              >
                Discard changes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
        <div
          className="mt-1 flex items-center gap-2"
          onMouseEnter={prefetchOtherSource}
          onFocus={prefetchOtherSource}
        >
          <Switch
            id="draft-content"
            disabled={!hasLiveCheckpoint}
            checked={previewSource === "draft"}
            onCheckedChange={(checked) => {
              previewStore.send({
                type: "setPreviewSource",
                source: checked ? "draft" : "live",
              });
            }}
          />
          <Label htmlFor="draft-content">Draft content</Label>
        </div>
      </div>
      <PublishDialog
        page={isPublishDialogOpen ? page : null}
        pageStatus={page.status}
        alsoPublishLayout={layoutCascade}
        open={isPublishDialogOpen}
        onOpenChange={setIsPublishDialogOpen}
      />
      <AlertDialog open={isUnpublishDialogOpen} onOpenChange={setIsUnpublishDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish page</AlertDialogTitle>
            <AlertDialogDescription>
              Visitors at{" "}
              <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                {page.fullPath}
              </code>{" "}
              will get a 404. The draft stays available in Camox Studio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default" disabled={unpublishPage.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnpublish}
              disabled={isHomePage || unpublishPage.isPending}
            >
              {unpublishPage.isPending ? "Unpublishing…" : "Unpublish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={isDiscardDialogOpen} onOpenChange={setIsDiscardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard draft changes</AlertDialogTitle>
            <AlertDialogDescription>
              The draft for{" "}
              <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                {page.fullPath}
              </code>{" "}
              will be reset to match the currently published version. This does not change what
              visitors see.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default" disabled={discardChanges.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardChanges} disabled={discardChanges.isPending}>
              {discardChanges.isPending ? "Discarding…" : "Discard changes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

/* -------------------------------------------------------------------------------------------------
 * useHydrateDraftCache
 *
 * SSR seeds the `'draft'` cache slot with the live snapshot data so the studio
 * can render immediately on first paint without a Suspense flash. That seed
 * is stale the moment there's an unpublished edit, though — on refresh the
 * studio would silently re-render the published version and the user's
 * in-flight changes would disappear from view (the row in the DB is fine).
 *
 * After the initial paint, fetch the real draft data and re-seed the draft
 * caches. From there, every block invalidation keeps the slot in sync. Only
 * runs for authenticated users — public visitors stay on the live cache.
 * -----------------------------------------------------------------------------------------------*/

function useHydrateDraftCache() {
  const isAuthenticated = useIsAuthenticated();
  const queryClient = useQueryClient();
  const projectSlug = useProjectSlug();
  const { pathname } = useLocation();

  React.useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void getApiClient()
      .pages.getByPath({ path: pathname, projectSlug, source: "draft" })
      .then((data) => {
        if (cancelled) return;
        seedBlockCaches(queryClient, data, "draft");
        queryClient.setQueryData(queryKeys.pages.getByPath(pathname, "draft"), {
          page: data.page,
          layout: data.layout,
          projectName: data.projectName,
          project: data.project,
        });
      })
      .catch(() => {
        // A draft fetch failure (network blip, 404 on a just-deleted page) is
        // non-fatal — the SSR-seeded view stays on screen and the next edit
        // invalidation will retry. Throwing here would break the studio for a
        // transient error.
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, pathname, projectSlug, queryClient]);
}

/* -------------------------------------------------------------------------------------------------
 * CamoxPreview
 * -----------------------------------------------------------------------------------------------*/

export const CamoxPreview = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useIsAuthenticated();
  const isPresentationMode = useSelector(previewStore, (state) => state.context.isPresentationMode);
  const isSidebarOpen = useSelector(previewStore, (state) => state.context.isSidebarOpen);
  const previewSource = useSelector(previewStore, (state) => state.context.previewSource);
  const pageData = usePreviewedPage();
  useHydrateDraftCache();

  // Gate "Preview live content" on a published snapshot existing — same rule
  // as the sidebar Switch. Without it, flipping to 'live' would Suspense on
  // an empty cache slot.
  const hasLiveCheckpoint = pageData.page.livePublishedCheckpointId != null;

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
        label: "Show Camox Studio",
        groupLabel: "Preview",
        checkIfAvailable: () => isAuthenticated && isPresentationMode,
        execute: () => previewStore.send({ type: "exitPresentationMode" }),
        shortcut: { key: "Enter", withMeta: true },
      },
      {
        id: "preview-live-content",
        label: "Preview live content",
        groupLabel: "Preview",
        checkIfAvailable: () => isAuthenticated && previewSource === "draft" && hasLiveCheckpoint,
        execute: () => previewStore.send({ type: "setPreviewSource", source: "live" }),
        shortcut: { key: "d", withAlt: true },
      },
      {
        id: "preview-draft-content",
        label: "Preview draft content",
        groupLabel: "Preview",
        checkIfAvailable: () => isAuthenticated && previewSource === "live",
        execute: () => previewStore.send({ type: "setPreviewSource", source: "draft" }),
        shortcut: { key: "d", withAlt: true },
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
  }, [isPresentationMode, isAuthenticated, previewSource, hasLiveCheckpoint]);

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
            <PanelHeader className={cn("flex flex-col gap-2 px-2 pt-2 pb-3")}>
              <ButtonGroup className="w-full">
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
                  <TooltipContent>Page metadata</TooltipContent>
                </Tooltip>
              </ButtonGroup>
              <SidebarPublishRow page={pageData.page} />
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
      <PageMetadataModal />
      <DraftSwitchDialog />
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
                label: `Go to "${page.nickname}"`,
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
