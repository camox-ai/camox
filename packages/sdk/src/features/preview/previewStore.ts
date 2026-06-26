import { toast } from "@camox/ui/toaster";
import { createStore } from "@xstate/store-react";

import { Block } from "@/core/createBlock";
import type { FieldType } from "@/core/lib/fieldTypes";
import { trackClientEvent } from "@/lib/telemetry-client";

/* -------------------------------------------------------------------------------------------------
 * Selection — normalized, flat pointer to the currently selected entity
 * -------------------------------------------------------------------------------------------------
 * Instead of encoding a path (breadcrumb trail), the selection points directly to the entity.
 * Breadcrumb UI is derived by walking up the parent chain from the items map.
 * ------------------------------------------------------------------------------------------------*/

export type Selection =
  | { type: "block"; blockId: number }
  | { type: "item"; blockId: number; itemId: number }
  | { type: "block-field"; blockId: number; fieldName: string; fieldType: FieldType }
  | {
      type: "item-field";
      blockId: number;
      itemId: number;
      fieldName: string;
      fieldType: FieldType;
    };

/** Extract the blockId from any selection variant. */
export function selectionBlockId(sel: Selection | null): number | null {
  return sel?.blockId ?? null;
}

/** Extract the itemId from item or item-field selections. */
export function selectionItemId(sel: Selection | null): number | null {
  if (!sel) return null;
  if (sel.type === "item" || sel.type === "item-field") return sel.itemId;
  return null;
}

/** Check if the selection is viewing a terminal field (link, image, file, etc.). */
export function selectionField(
  sel: Selection | null,
): { fieldName: string; fieldType: FieldType } | null {
  if (!sel) return null;
  if (sel.type === "block-field" || sel.type === "item-field") {
    return { fieldName: sel.fieldName, fieldType: sel.fieldType };
  }
  return null;
}

/**
 * Which side of the draft/publish split the studio is currently previewing.
 * 'draft' (default) shows in-flight editor changes; 'live' shows visitors'
 * view (the page's live published checkpoint snapshot).
 */
export type PreviewSource = "draft" | "live";
export type ViewportMode = "full" | "tablet" | "mobile";

interface PreviewContext {
  isEditMode: boolean;
  isToolbarHidden: boolean;
  isSidebarOpen: boolean;
  isPageEditorSidebarOpen: boolean;
  isAddBlockSidebarOpen: boolean;
  /** Source label for the in-progress add-block flow (popover, shortcut, page-tree, overlay). */
  addBlockSource: string | null;
  isAgentChatSidebarOpen: boolean;
  agentChatPageScaffoldContext: {
    id: number;
    nickname: string;
    fullPath: string;
  } | null;
  isCreatePageModalOpen: boolean;
  editingPageId: number | null;
  /** Open/closed state of the "Switch to draft to edit?" confirmation dialog. */
  isDraftSwitchDialogOpen: boolean;
  viewportMode: ViewportMode;
  peekedBlock: Block | null;
  peekedBlockPosition: string | null;
  peekedPagePathname: string | null;
  skipPeekedBlockExitAnimation: boolean;
  selection: Selection | null;
  pendingAgentBlockFocus: { blockId: number; requestId: number } | null;
  iframeElement: HTMLIFrameElement | null;
  previewSource: PreviewSource;
}

export const previewStore = createStore({
  context: {
    isEditMode: false,
    isToolbarHidden: false,
    isSidebarOpen: true,
    isPageEditorSidebarOpen: false,
    isAddBlockSidebarOpen: false,
    addBlockSource: null,
    isAgentChatSidebarOpen: false,
    agentChatPageScaffoldContext: null,
    isCreatePageModalOpen: false,
    editingPageId: null,
    isDraftSwitchDialogOpen: false,
    viewportMode: "full",
    peekedBlock: null,
    peekedBlockPosition: null,
    peekedPagePathname: null,
    skipPeekedBlockExitAnimation: false,
    selection: null,
    pendingAgentBlockFocus: null,
    iframeElement: null,
    previewSource: "draft",
  } as PreviewContext,
  on: {
    exitEditMode: (context, _, enqueue) => {
      if (!context.isEditMode) return context;
      enqueue.effect(() => {
        trackClientEvent("edit_mode_toggled", { enabled: false });
      });
      return { ...context, isEditMode: false };
    },
    enterEditMode: (context, _, enqueue) => {
      if (context.isEditMode) return context;
      enqueue.effect(() => {
        trackClientEvent("edit_mode_toggled", { enabled: true });
      });
      return { ...context, isEditMode: true, isSidebarOpen: true };
    },
    hideToolbar: (context) => ({ ...context, isToolbarHidden: true }),
    toggleSidebar: (context) => ({ ...context, isSidebarOpen: true }),
    setViewportMode: (context, event: { mode: ViewportMode }) => {
      if (context.viewportMode === event.mode) return context;
      return { ...context, viewportMode: event.mode };
    },
    cycleViewportMode: (context) => {
      const nextMode: ViewportMode =
        context.viewportMode === "full"
          ? "tablet"
          : context.viewportMode === "tablet"
            ? "mobile"
            : "full";
      return { ...context, viewportMode: nextMode };
    },
    setPeekedBlock: (context, event: { block: Block; afterPosition?: string | null }) => {
      if (!event.block) return context;
      return {
        ...context,
        peekedBlock: event.block,
        peekedBlockPosition: event.afterPosition ?? null,
      };
    },
    exitPeekedBlock: (context) => ({
      ...context,
      peekedBlock: null,
      peekedBlockPosition: null,
      isAddBlockSidebarOpen: false,
    }),
    clearPeekedBlock: (context) => ({
      ...context,
      peekedBlock: null,
      peekedBlockPosition: null,
    }),

    /* --- Selection events --- */

    setSelection: (context, event: { selection: Selection | null }) => ({
      ...context,
      selection: event.selection,
      pendingAgentBlockFocus: null,
    }),
    setFocusedBlock: (context, event: { blockId: number }) => ({
      ...context,
      selection: { type: "block" as const, blockId: event.blockId },
      pendingAgentBlockFocus: null,
      peekedBlock: null,
      peekedBlockPosition: null,
      isAddBlockSidebarOpen: false,
    }),
    focusAgentBlock: (context, event: { blockId: number }) => ({
      ...context,
      selection: { type: "block" as const, blockId: event.blockId },
      pendingAgentBlockFocus: {
        blockId: event.blockId,
        requestId: (context.pendingAgentBlockFocus?.requestId ?? 0) + 1,
      },
      peekedBlock: null,
      peekedBlockPosition: null,
      isAddBlockSidebarOpen: false,
    }),
    clearPendingAgentBlockFocus: (context, event: { requestId: number }) => {
      if (context.pendingAgentBlockFocus?.requestId !== event.requestId) return context;
      return {
        ...context,
        pendingAgentBlockFocus: null,
      };
    },
    selectItem: (context, event: { blockId: number; itemId: number }) => ({
      ...context,
      selection: { type: "item" as const, blockId: event.blockId, itemId: event.itemId },
      pendingAgentBlockFocus: null,
    }),
    selectBlockField: (
      context,
      event: { blockId: number; fieldName: string; fieldType: FieldType },
    ) => ({
      ...context,
      selection: {
        type: "block-field" as const,
        blockId: event.blockId,
        fieldName: event.fieldName,
        fieldType: event.fieldType,
      },
      pendingAgentBlockFocus: null,
    }),
    selectItemField: (
      context,
      event: { blockId: number; itemId: number; fieldName: string; fieldType: FieldType },
    ) => ({
      ...context,
      selection: {
        type: "item-field" as const,
        blockId: event.blockId,
        itemId: event.itemId,
        fieldName: event.fieldName,
        fieldType: event.fieldType,
      },
      pendingAgentBlockFocus: null,
    }),
    selectParent: (context) => {
      const sel = context.selection;
      if (!sel) return context;
      if (sel.type === "block-field") {
        return { ...context, selection: { type: "block" as const, blockId: sel.blockId } };
      }
      if (sel.type === "item-field") {
        return {
          ...context,
          selection: { type: "item" as const, blockId: sel.blockId, itemId: sel.itemId },
        };
      }
      if (sel.type === "item") {
        return { ...context, selection: { type: "block" as const, blockId: sel.blockId } };
      }
      return context;
    },
    clearSelection: (context) => ({
      ...context,
      selection: null,
      pendingAgentBlockFocus: null,
    }),
    setPeekedPage: (context, event: { pathname: string }) => ({
      ...context,
      selection: null,
      pendingAgentBlockFocus: null,
      peekedPagePathname: event.pathname,
    }),
    clearPeekedPage: (context) => ({
      ...context,
      peekedPagePathname: null,
    }),
    openAddBlockSidebar: (context, event: { afterPosition?: string | null; via?: string }) => ({
      ...context,
      isAddBlockSidebarOpen: true,
      addBlockSource: event.via ?? null,
      peekedBlock: null,
      peekedBlockPosition: event.afterPosition ?? null,
    }),
    closeAddBlockSidebar: (context) => ({
      ...context,
      isAddBlockSidebarOpen: false,
      addBlockSource: null,
      peekedBlock: null,
      peekedBlockPosition: null,
    }),
    focusCreatedBlock: (context, event: { blockId: number }) => ({
      ...context,
      selection: { type: "block" as const, blockId: event.blockId },
      pendingAgentBlockFocus: null,
      isAddBlockSidebarOpen: false,
      peekedBlock: null,
      peekedBlockPosition: null,
      skipPeekedBlockExitAnimation: true,
    }),
    clearSkipPeekedBlockExitAnimation: (context) => ({
      ...context,
      skipPeekedBlockExitAnimation: false,
    }),
    toggleContentSheet: (context) => ({
      ...context,
      isPageEditorSidebarOpen: false,
    }),
    openBlockContentSheet: (context, event: { blockId: number }) => {
      const currentBlockMatches = context.selection?.blockId === event.blockId;
      return {
        ...context,
        isPageEditorSidebarOpen: false,
        selection: currentBlockMatches
          ? context.selection
          : { type: "block" as const, blockId: event.blockId },
      };
    },
    closeBlockContentSheet: (context) => ({
      ...context,
      isPageEditorSidebarOpen: false,
    }),
    openAgentChatSidebar: (
      context,
      event:
        | {
            pageScaffoldContext?: {
              nickname: string;
              fullPath: string;
            };
          }
        | undefined,
      enqueue,
    ) => {
      const pageScaffoldContext = event?.pageScaffoldContext;
      if (context.isAgentChatSidebarOpen && !pageScaffoldContext) return context;
      enqueue.effect(() => trackClientEvent("agent_chat_opened"));
      return {
        ...context,
        isAgentChatSidebarOpen: true,
        agentChatPageScaffoldContext: pageScaffoldContext
          ? {
              id: Date.now(),
              nickname: pageScaffoldContext.nickname,
              fullPath: pageScaffoldContext.fullPath,
            }
          : context.agentChatPageScaffoldContext,
      };
    },
    closeAgentChatSidebar: (context) => ({
      ...context,
      isAgentChatSidebarOpen: false,
    }),
    clearAgentChatPageScaffoldContext: (context) => ({
      ...context,
      agentChatPageScaffoldContext: null,
    }),
    openCreatePageModal: (context) => ({
      ...context,
      isCreatePageModalOpen: true,
    }),
    closeCreatePageModal: (context) => ({
      ...context,
      isCreatePageModalOpen: false,
    }),
    openEditPageModal: (context, event: { pageId: number }, enqueue) => {
      if (context.editingPageId === event.pageId) return context;
      enqueue.effect(() => trackClientEvent("page_editor_opened", { pageId: event.pageId }));
      return { ...context, editingPageId: event.pageId };
    },
    closeEditPageModal: (context) => ({
      ...context,
      editingPageId: null,
    }),
    setIframeElement: (context, event: { element: HTMLIFrameElement | null }) => ({
      ...context,
      iframeElement: event.element,
    }),
    setPreviewSource: (context, event: { source: PreviewSource }, enqueue) => {
      if (event.source === context.previewSource) return context;
      enqueue.effect(() => {
        toast(event.source === "draft" ? "Previewing draft content" : "Previewing live content", {
          duration: 2500,
        });
      });
      return { ...context, previewSource: event.source };
    },
    requestDraftSwitch: (context) => {
      if (context.previewSource === "draft") return context;
      return { ...context, isDraftSwitchDialogOpen: true };
    },
    dismissDraftSwitch: (context) => ({ ...context, isDraftSwitchDialogOpen: false }),
  },
});
