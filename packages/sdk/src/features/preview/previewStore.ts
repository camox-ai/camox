import { toast } from "@camox/ui/toaster";
import { createStore } from "@xstate/store";

import { Block } from "@/core/createBlock";
import type { FieldType } from "@/core/lib/fieldTypes";
import type { Page } from "@/lib/queries";

/* -------------------------------------------------------------------------------------------------
 * Selection — normalized, flat pointer to the currently selected entity
 * -------------------------------------------------------------------------------------------------
 * Instead of encoding a path (breadcrumb trail), the selection points directly to the entity.
 * Breadcrumb UI is derived by walking up the parent chain from the items map.
 * ------------------------------------------------------------------------------------------------*/

export type Selection =
  | { type: "block"; blockId: string }
  | { type: "item"; blockId: string; itemId: string }
  | { type: "block-field"; blockId: string; fieldName: string; fieldType: FieldType }
  | {
      type: "item-field";
      blockId: string;
      itemId: string;
      fieldName: string;
      fieldType: FieldType;
    };

/** Extract the blockId from any selection variant. */
export function selectionBlockId(sel: Selection | null): string | null {
  return sel?.blockId ?? null;
}

/** Extract the itemId from item or item-field selections. */
export function selectionItemId(sel: Selection | null): string | null {
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

interface PreviewContext {
  isPresentationMode: boolean;
  isSidebarOpen: boolean;
  isPageContentSheetOpen: boolean;
  isAddBlockSheetOpen: boolean;
  isAgentChatSheetOpen: boolean;
  isCreatePageSheetOpen: boolean;
  editingPage: Page | null;
  isContentLocked: boolean;
  isMobileMode: boolean;
  peekedBlock: Block | null;
  peekedBlockPosition: string | null;
  peekedPagePathname: string | null;
  skipPeekedBlockExitAnimation: boolean;
  selection: Selection | null;
  iframeElement: HTMLIFrameElement | null;
}

export const previewStore = createStore({
  context: {
    isPresentationMode: false,
    isSidebarOpen: true,
    isPageContentSheetOpen: false,
    isAddBlockSheetOpen: false,
    isAgentChatSheetOpen: false,
    isCreatePageSheetOpen: false,
    editingPage: null,
    isContentLocked: false,
    isMobileMode: false,
    peekedBlock: null,
    peekedBlockPosition: null,
    peekedPagePathname: null,
    skipPeekedBlockExitAnimation: false,
    selection: null,
    iframeElement: null,
  } as PreviewContext,
  on: {
    enterPresentationMode: (context, _, enqueue) => {
      if (context.isPresentationMode) return context;
      enqueue.effect(() => {
        toast("Entering presentation mode. Press ⌘ + Escape to restore admin interface", {
          duration: 4000,
        });
      });
      return { ...context, isPresentationMode: true };
    },
    exitPresentationMode: (context, _, enqueue) => {
      if (!context.isPresentationMode) return context;
      enqueue.effect(() => {
        toast("Leaving presentation mode");
      });
      return { ...context, isPresentationMode: false };
    },
    toggleSidebar: (context) => {
      if (context.isPresentationMode) return context;
      return { ...context, isSidebarOpen: !context.isSidebarOpen };
    },
    toggleLockContent: (context, _, enqueue) => {
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
    setFocusedBlock: (context, event: { blockId: string }) => ({
      ...context,
      selection: { type: "block" as const, blockId: event.blockId },
      peekedBlock: null,
      peekedBlockPosition: null,
      isAddBlockSheetOpen: false,
    }),
    selectItem: (context, event: { blockId: string; itemId: string }) => ({
      ...context,
      selection: { type: "item" as const, blockId: event.blockId, itemId: event.itemId },
    }),
    selectBlockField: (
      context,
      event: { blockId: string; fieldName: string; fieldType: FieldType },
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
      event: { blockId: string; itemId: string; fieldName: string; fieldType: FieldType },
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
    openAddBlockSheet: (context, event: { afterPosition?: string | null }) => ({
      ...context,
      isAddBlockSheetOpen: true,
      peekedBlock: null,
      peekedBlockPosition: event.afterPosition ?? null,
    }),
    closeAddBlockSheet: (context) => ({
      ...context,
      isAddBlockSheetOpen: false,
      peekedBlock: null,
      peekedBlockPosition: null,
    }),
    focusCreatedBlock: (context, event: { blockId: string }) => ({
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
    openBlockContentSheet: (context, event: { blockId: string }) => {
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
    openAgentChatSheet: (context) => ({
      ...context,
      isAgentChatSheetOpen: true,
    }),
    closeAgentChatSheet: (context) => ({
      ...context,
      isAgentChatSheetOpen: false,
    }),
    openCreatePageSheet: (context) => ({
      ...context,
      isCreatePageSheetOpen: true,
    }),
    closeCreatePageSheet: (context) => ({
      ...context,
      isCreatePageSheetOpen: false,
    }),
    openEditPageSheet: (context, event: { page: Page }) => ({
      ...context,
      editingPage: event.page,
    }),
    closeEditPageSheet: (context) => ({
      ...context,
      editingPage: null,
    }),
    setIframeElement: (context, event: { element: HTMLIFrameElement | null }) => ({
      ...context,
      iframeElement: event.element,
    }),
  },
});
