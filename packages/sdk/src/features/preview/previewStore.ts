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
 * view (the page's live published checkpoint snapshot). While previewing
 * anything other than draft, content is fully read-only: `isContentLocked`
 * is forced true (so in-canvas overlays vanish) and every external edit
 * entry point gates on `useRequireDraftSource` — an attempt opens the
 * "Switch to draft to edit?" dialog instead of mutating.
 */
export type PreviewSource = "draft" | "live";

interface PreviewContext {
  isPresentationMode: boolean;
  isSidebarOpen: boolean;
  isPageContentSheetOpen: boolean;
  isAddBlockSheetOpen: boolean;
  /** Source label for the in-progress add-block flow (popover, shortcut, page-tree, overlay). */
  addBlockSource: string | null;
  isAgentChatSheetOpen: boolean;
  agentChatPageScaffoldContext: {
    id: number;
    nickname: string;
    fullPath: string;
  } | null;
  isCreatePageModalOpen: boolean;
  editingPageId: number | null;
  isContentLocked: boolean;
  /**
   * Remembered value of `isContentLocked` from before the user switched away
   * from `'draft'`. While previewing anything other than draft, lock is
   * forced true; on return to draft we restore this so a user who'd manually
   * locked stays locked, and one who hadn't goes back to editable.
   */
  prePreviewLockState: boolean | null;
  /** Open/closed state of the "Switch to draft to edit?" confirmation dialog. */
  isDraftSwitchDialogOpen: boolean;
  isMobileMode: boolean;
  peekedBlock: Block | null;
  peekedBlockPosition: string | null;
  peekedPagePathname: string | null;
  skipPeekedBlockExitAnimation: boolean;
  selection: Selection | null;
  iframeElement: HTMLIFrameElement | null;
  previewSource: PreviewSource;
}

export const previewStore = createStore({
  context: {
    isPresentationMode: false,
    isSidebarOpen: true,
    isPageContentSheetOpen: false,
    isAddBlockSheetOpen: false,
    addBlockSource: null,
    isAgentChatSheetOpen: false,
    agentChatPageScaffoldContext: null,
    isCreatePageModalOpen: false,
    editingPageId: null,
    isContentLocked: false,
    prePreviewLockState: null,
    isDraftSwitchDialogOpen: false,
    isMobileMode: false,
    peekedBlock: null,
    peekedBlockPosition: null,
    peekedPagePathname: null,
    skipPeekedBlockExitAnimation: false,
    selection: null,
    iframeElement: null,
    previewSource: "draft",
  } as PreviewContext,
  on: {
    enterPresentationMode: (context, _, enqueue) => {
      if (context.isPresentationMode) return context;
      enqueue.effect(() => {
        toast("Press ⌘ + Enter to restore Camox Studio", {
          duration: 2500,
        });
        trackClientEvent("presentation_mode_toggled", { enabled: true });
      });
      return { ...context, isPresentationMode: true };
    },
    exitPresentationMode: (context, _, enqueue) => {
      if (!context.isPresentationMode) return context;
      enqueue.effect(() => {
        trackClientEvent("presentation_mode_toggled", { enabled: false });
      });
      return { ...context, isPresentationMode: false };
    },
    toggleSidebar: (context) => {
      if (context.isPresentationMode) return context;
      return { ...context, isSidebarOpen: !context.isSidebarOpen };
    },
    toggleLockContent: (context, _, enqueue) => {
      // Manual lock toggle is reserved for the 'draft' source. While
      // previewing a non-draft source, lock is forced true and the user
      // cannot manually flip it — they have to switch back to draft first.
      if (context.previewSource !== "draft") return context;
      enqueue.effect(() => {
        toast(context.isContentLocked ? "Enabling edits" : "Preventing edits");
      });
      return { ...context, isContentLocked: !context.isContentLocked };
    },
    toggleMobileMode: (context, _, enqueue) => {
      enqueue.effect(() => {
        toast(context.isMobileMode ? "Leaving mobile mode" : "Entering mobile mode");
      });
      return { ...context, isMobileMode: !context.isMobileMode };
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
      isAddBlockSheetOpen: false,
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
    }),
    setFocusedBlock: (context, event: { blockId: number }) => ({
      ...context,
      selection: { type: "block" as const, blockId: event.blockId },
      peekedBlock: null,
      peekedBlockPosition: null,
      isAddBlockSheetOpen: false,
    }),
    selectItem: (context, event: { blockId: number; itemId: number }) => ({
      ...context,
      selection: { type: "item" as const, blockId: event.blockId, itemId: event.itemId },
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
    }),
    setPeekedPage: (context, event: { pathname: string }) => ({
      ...context,
      selection: null,
      peekedPagePathname: event.pathname,
    }),
    clearPeekedPage: (context) => ({
      ...context,
      peekedPagePathname: null,
    }),
    openAddBlockSheet: (context, event: { afterPosition?: string | null; via?: string }) => ({
      ...context,
      isAddBlockSheetOpen: true,
      addBlockSource: event.via ?? null,
      peekedBlock: null,
      peekedBlockPosition: event.afterPosition ?? null,
    }),
    closeAddBlockSheet: (context) => ({
      ...context,
      isAddBlockSheetOpen: false,
      addBlockSource: null,
      peekedBlock: null,
      peekedBlockPosition: null,
    }),
    focusCreatedBlock: (context, event: { blockId: number }) => ({
      ...context,
      selection: { type: "block" as const, blockId: event.blockId },
      isAddBlockSheetOpen: false,
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
      isPageContentSheetOpen: !context.isPageContentSheetOpen,
    }),
    openBlockContentSheet: (context, event: { blockId: number }) => {
      const currentBlockMatches = context.selection?.blockId === event.blockId;
      return {
        ...context,
        isPageContentSheetOpen: true,
        selection: currentBlockMatches
          ? context.selection
          : { type: "block" as const, blockId: event.blockId },
      };
    },
    closeBlockContentSheet: (context) => ({
      ...context,
      isPageContentSheetOpen: false,
    }),
    openAgentChatSheet: (
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
      if (context.isAgentChatSheetOpen && !pageScaffoldContext) return context;
      enqueue.effect(() => trackClientEvent("agent_chat_opened"));
      return {
        ...context,
        isAgentChatSheetOpen: true,
        agentChatPageScaffoldContext: pageScaffoldContext
          ? {
              id: Date.now(),
              nickname: pageScaffoldContext.nickname,
              fullPath: pageScaffoldContext.fullPath,
            }
          : context.agentChatPageScaffoldContext,
      };
    },
    closeAgentChatSheet: (context) => ({
      ...context,
      isAgentChatSheetOpen: false,
      agentChatPageScaffoldContext: null,
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
      // Entering a non-draft preview: remember the user's prior lock state
      // and force-lock. Overlays vanish (existing `isContentLocked` plumbing)
      // and the lock toggle UI/shortcut go disabled (see PreviewToolbar,
      // useAdminShortcuts).
      if (event.source !== "draft" && context.previewSource === "draft") {
        return {
          ...context,
          previewSource: event.source,
          prePreviewLockState: context.isContentLocked,
          isContentLocked: true,
        };
      }
      // Returning to draft: restore the prior lock state so a user who'd
      // manually locked before peeking stays locked.
      if (event.source === "draft" && context.previewSource !== "draft") {
        return {
          ...context,
          previewSource: "draft" as const,
          isContentLocked: context.prePreviewLockState ?? false,
          prePreviewLockState: null,
        };
      }
      return { ...context, previewSource: event.source };
    },
    requestDraftSwitch: (context) => {
      if (context.previewSource === "draft") return context;
      return { ...context, isDraftSwitchDialogOpen: true };
    },
    dismissDraftSwitch: (context) => ({ ...context, isDraftSwitchDialogOpen: false }),
  },
});
