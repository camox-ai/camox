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
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@camox/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@camox/ui/popover";
import { toast } from "@camox/ui/toaster";
import { useMutation } from "@tanstack/react-query";
import { useSelector } from "@xstate/store/react";
import { Copy, Pen, Settings, Trash2 } from "lucide-react";
import * as React from "react";

import { trackClientEvent } from "@/lib/analytics-client";
import { blockMutations, repeatableItemMutations, type PageWithBlocks } from "@/lib/queries";
import { formatShortcut } from "@/lib/utils";

import type { Action } from "../../provider/actionsStore";
import { actionsStore } from "../../provider/actionsStore";
import { useCamoxApp } from "../../provider/components/CamoxAppContext";
import { usePreviewedPage } from "../CamoxPreview";
import { previewStore, type SelectionBreadcrumb } from "../previewStore";
import { useUpdateBlockPosition } from "./useUpdateBlockPosition";

interface BlockActionsPopoverProps {
  block: PageWithBlocks["blocks"][number] | undefined | null;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLayoutBlock?: boolean;
  layoutPlacement?: "before" | "after";
}

const BlockActionsPopover = ({
  block,
  children,
  open,
  onOpenChange,
  align = "start",
  isLayoutBlock,
  layoutPlacement,
}: BlockActionsPopoverProps) => {
  const [blockToDelete, setBlockToDelete] = React.useState<PageWithBlocks["blocks"][number] | null>(
    null,
  );

  const camoxApp = useCamoxApp();
  const page = usePreviewedPage();

  const deleteBlock = useMutation(blockMutations.delete());
  const duplicateBlock = useMutation(blockMutations.duplicate());
  const deleteManyBlocks = useMutation(blockMutations.deleteMany());

  const handleDeleteBlock = async (block: PageWithBlocks["blocks"][number]) => {
    try {
      await deleteBlock.mutateAsync({ id: block.id });
      trackClientEvent("block_deleted", {
        projectId: page?.page.projectId,
        blockType: block.type,
      });
      toast.success(`Deleted "${block.summary || block.type}" block`);
    } catch (error) {
      console.error("Failed to delete block:", error);
      toast.error("Could not delete block");
    } finally {
      setBlockToDelete(null);
    }
  };

  const handleDuplicateBlock = async (block: PageWithBlocks["blocks"][number]) => {
    try {
      await duplicateBlock.mutateAsync({ id: block.id });
      trackClientEvent("block_duplicated", {
        projectId: page?.page.projectId,
        blockType: block.type,
      });
      toast.success(`Duplicated "${block.summary}" block`);
    } catch (error) {
      console.error("Failed to duplicate block:", error);
      toast.error("Could not duplicate block");
    }
  };

  const handleAddBlockAbove = (block: PageWithBlocks["blocks"][number]) => {
    if (!page) return;

    const blockIndex = page.blocks.findIndex((b) => String(b.id) === String(block.id));
    const afterPosition = blockIndex > 0 ? page.blocks[blockIndex - 1].position : "";

    previewStore.send({
      type: "openAddBlockSheet",
      afterPosition,
    });
  };

  const handleAddBlockBelow = (block: PageWithBlocks["blocks"][number]) => {
    previewStore.send({
      type: "openAddBlockSheet",
      afterPosition: block.position,
    });
  };

  const getBlocksAbove = (block: PageWithBlocks["blocks"][number]) => {
    if (!page) return [];
    const blockIndex = page.blocks.findIndex((b) => String(b.id) === String(block.id));
    return page.blocks.slice(0, blockIndex);
  };

  const getBlocksBelow = (block: PageWithBlocks["blocks"][number]) => {
    if (!page) return [];
    const blockIndex = page.blocks.findIndex((b) => String(b.id) === String(block.id));
    return page.blocks.slice(blockIndex + 1);
  };

  const handleDeleteBlocksAbove = async (block: PageWithBlocks["blocks"][number]) => {
    const blocksAbove = getBlocksAbove(block);
    if (blocksAbove.length === 0) return;

    try {
      await deleteManyBlocks.mutateAsync({ blockIds: blocksAbove.map((b) => b.id) });
      toast.success(`Deleted ${blocksAbove.length} block${blocksAbove.length === 1 ? "" : "s"}`);
    } catch (error) {
      console.error("Failed to delete blocks above:", error);
      toast.error("Could not delete blocks");
    }
  };

  const handleDeleteBlocksBelow = async (block: PageWithBlocks["blocks"][number]) => {
    const blocksBelow = getBlocksBelow(block);
    if (blocksBelow.length === 0) return;

    try {
      await deleteManyBlocks.mutateAsync({ blockIds: blocksBelow.map((b) => b.id) });
      toast.success(`Deleted ${blocksBelow.length} block${blocksBelow.length === 1 ? "" : "s"}`);
    } catch (error) {
      console.error("Failed to delete blocks below:", error);
      toast.error("Could not delete blocks");
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        {block && (
          <PopoverContent className="w-[300px] p-0" align={align}>
            <Command>
              <CommandInput placeholder="Search actions..." />
              <CommandList className="max-h-[350px]">
                <CommandGroup>
                  <CommandItem
                    className="justify-between"
                    onSelect={() => {
                      previewStore.send({
                        type: "openBlockContentSheet",
                        blockId: String(block.id),
                      });
                      onOpenChange(false);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Pen className="h-4 w-4" />
                      Edit in form
                    </div>
                    {formatShortcut({ key: "j", withMeta: true })}
                  </CommandItem>
                  {!isLayoutBlock &&
                    (() => {
                      const blockDef = camoxApp.getBlockById(block.type);
                      const hasSettings =
                        blockDef?.settingsSchema?.properties &&
                        Object.keys(blockDef.settingsSchema.properties).length > 0;
                      if (!hasSettings) return null;
                      return (
                        <CommandItem
                          className="justify-between"
                          onSelect={() => {
                            previewStore.send({
                              type: "openBlockContentSheet",
                              blockId: String(block.id),
                            });
                            onOpenChange(false);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            Open settings
                          </div>
                        </CommandItem>
                      );
                    })()}
                </CommandGroup>
                {isLayoutBlock && layoutPlacement === "before" && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          previewStore.send({
                            type: "openAddBlockSheet",
                            afterPosition: "",
                          });
                          onOpenChange(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-4" />
                          Add block below
                        </div>
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
                {isLayoutBlock && layoutPlacement === "after" && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          const lastPageBlock = page?.blocks[page.blocks.length - 1];
                          previewStore.send({
                            type: "openAddBlockSheet",
                            afterPosition: lastPageBlock?.position,
                          });
                          onOpenChange(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-4" />
                          Add block above
                        </div>
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
                {!isLayoutBlock && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        className="justify-between"
                        onSelect={() => {
                          handleAddBlockBelow(block);
                          onOpenChange(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-4" />
                          Add block below
                        </div>
                        {formatShortcut({ key: "o" })}
                      </CommandItem>
                      <CommandItem
                        className="justify-between"
                        onSelect={() => {
                          handleAddBlockAbove(block);
                          onOpenChange(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-4" />
                          Add block above
                        </div>
                        {formatShortcut({ key: "o", withShift: true })}
                      </CommandItem>
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        className="justify-between"
                        onSelect={() => {
                          handleDuplicateBlock(block);
                          onOpenChange(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <Copy className="h-4 w-4" />
                          Duplicate block
                        </div>
                        {formatShortcut({ key: "d", withMeta: true })}
                      </CommandItem>
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          handleDeleteBlocksAbove(block);
                          onOpenChange(false);
                        }}
                        disabled={getBlocksAbove(block).length === 0}
                      >
                        <span className="w-4" />
                        Delete blocks above
                      </CommandItem>
                      <CommandItem
                        onSelect={() => {
                          handleDeleteBlocksBelow(block);
                          onOpenChange(false);
                        }}
                        disabled={getBlocksBelow(block).length === 0}
                      >
                        <span className="w-4" />
                        Delete blocks below
                      </CommandItem>
                      <CommandItem
                        className="justify-between"
                        onSelect={() => {
                          handleDeleteBlock(block);
                          onOpenChange(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <Trash2 className="h-4 w-4" />
                          Delete block
                        </div>
                        {formatShortcut({ key: "Backspace", withMeta: true })}
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        )}
      </Popover>
      <AlertDialog open={!!blockToDelete} onOpenChange={(open) => !open && setBlockToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete block</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{blockToDelete?.summary}</strong>? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => blockToDelete && handleDeleteBlock(blockToDelete)}
              asChild
            >
              <Button variant="destructive">Delete</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

/**
 * Walk breadcrumbs from deepest to shallowest and return the first
 * RepeatableObject or Block entry — i.e. the closest ancestor that
 * can be duplicated / deleted.
 */
function findClosestActionable(breadcrumbs: SelectionBreadcrumb[]) {
  for (let i = breadcrumbs.length - 1; i >= 0; i--) {
    const crumb = breadcrumbs[i];
    if (crumb.type === "RepeatableObject") return crumb;
    if (crumb.type === "Block") return crumb;
  }
  return null;
}

function isLayoutBlockId(page: ReturnType<typeof usePreviewedPage>, blockId: string): boolean {
  if (!page?.layout) return false;
  const allLayoutBlocks = [...(page.layout.beforeBlocks ?? []), ...(page.layout.afterBlocks ?? [])];
  return allLayoutBlocks.some((b) => String(b.id) === blockId);
}

function useBlockActionsShortcuts() {
  const camoxApp = useCamoxApp();
  const page = usePreviewedPage();
  const selectionBreadcrumbs = useSelector(
    previewStore,
    (state) => state.context.selectionBreadcrumbs,
  );

  const deleteBlockMutation = useMutation(blockMutations.delete());
  const duplicateBlockMutation = useMutation(blockMutations.duplicate());
  const updatePositionMutation = useUpdateBlockPosition();
  const deleteRepeatableItem = useMutation(repeatableItemMutations.delete());
  const duplicateRepeatableItem = useMutation(repeatableItemMutations.duplicate());

  React.useEffect(() => {
    const actions = [
      {
        id: "delete-selected",
        label: "Delete selected",
        groupLabel: "Preview",
        shortcut: { key: "Backspace", withMeta: true },
        icon: "Trash2",
        checkIfAvailable: () => {
          const ctx = previewStore.getSnapshot().context;
          if (ctx.isContentLocked || ctx.isPresentationMode) return false;
          const breadcrumbs = ctx.selectionBreadcrumbs;
          const blockCrumb = breadcrumbs.find((b) => b.type === "Block");
          if (blockCrumb && isLayoutBlockId(page, blockCrumb.id)) return false;
          const target = findClosestActionable(breadcrumbs);
          if (!target) return false;

          if (target.type === "RepeatableObject") {
            if (!page) return false;
            if (!blockCrumb) return false;
            const block = page.blocks.find((b) => String(b.id) === blockCrumb.id);
            if (!block) return false;
            for (const [, value] of Object.entries(block.content)) {
              if (!Array.isArray(value)) continue;
              const item = value.find((i: any) => String(i.id) === target.id);
              if (item) return value.length > 1;
            }
            return false;
          }

          // Block — allow delete only if more than 1 block
          return (page?.blocks.length ?? 0) > 1;
        },
        execute: () => {
          const breadcrumbs = previewStore.getSnapshot().context.selectionBreadcrumbs;
          const target = findClosestActionable(breadcrumbs);
          if (!target) return;

          if (target.type === "RepeatableObject") {
            deleteRepeatableItem.mutateAsync({ id: Number(target.id) }).then(
              () => toast.success("Deleted item"),
              () => toast.error("Could not delete item"),
            );
            previewStore.send({ type: "selectParentBreadcrumb" });
            return;
          }

          const block = page?.blocks.find((b) => String(b.id) === target.id);
          deleteBlockMutation.mutateAsync({ id: Number(target.id) }).then(
            () => toast.success(`Deleted "${block?.summary || block?.type}" block`),
            () => toast.error("Could not delete block"),
          );
          previewStore.send({ type: "clearSelection" });
        },
      },
      {
        id: "duplicate-selected",
        label: "Duplicate selected",
        groupLabel: "Preview",
        shortcut: { key: "d", withMeta: true },
        icon: "Copy",
        checkIfAvailable: () => {
          const ctx = previewStore.getSnapshot().context;
          if (ctx.isContentLocked || ctx.isPresentationMode) return false;
          const blockCrumb = ctx.selectionBreadcrumbs.find((b) => b.type === "Block");
          if (blockCrumb && isLayoutBlockId(page, blockCrumb.id)) return false;
          return findClosestActionable(ctx.selectionBreadcrumbs) !== null;
        },
        execute: () => {
          const breadcrumbs = previewStore.getSnapshot().context.selectionBreadcrumbs;
          const target = findClosestActionable(breadcrumbs);
          if (!target) return;

          if (target.type === "RepeatableObject") {
            duplicateRepeatableItem.mutateAsync({ id: Number(target.id) }).then(
              () => toast.success("Duplicated item"),
              () => toast.error("Could not duplicate item"),
            );
            return;
          }

          const block = page?.blocks.find((b) => String(b.id) === target.id);
          duplicateBlockMutation.mutateAsync({ id: Number(target.id) }).then(
            () => toast.success(`Duplicated "${block?.summary}" block`),
            () => toast.error("Could not duplicate block"),
          );
        },
      },
      {
        id: "move-block-up",
        label: "Move block up",
        groupLabel: "Preview",
        shortcut: { key: "ArrowUp", withAlt: true },
        icon: "ArrowUp",
        checkIfAvailable: () => {
          const ctx = previewStore.getSnapshot().context;
          if (ctx.isContentLocked || ctx.isPresentationMode) return false;
          const blockCrumb = ctx.selectionBreadcrumbs.find((b) => b.type === "Block");
          if (!blockCrumb || !page) return false;
          if (isLayoutBlockId(page, blockCrumb.id)) return false;
          const index = page.blocks.findIndex((b) => String(b.id) === blockCrumb.id);
          return index > 0;
        },
        execute: () => {
          const blockCrumb = previewStore
            .getSnapshot()
            .context.selectionBreadcrumbs.find((b) => b.type === "Block");
          if (!blockCrumb || !page) return;
          const index = page.blocks.findIndex((b) => String(b.id) === blockCrumb.id);
          if (index <= 0) return;

          const afterPosition = index > 1 ? page.blocks[index - 2].position : undefined;
          const beforePosition = page.blocks[index - 1].position;

          updatePositionMutation
            .mutateAsync({ id: Number(blockCrumb.id), afterPosition, beforePosition })
            .then(
              () => {},
              () => toast.error("Could not move block"),
            );
        },
      },
      {
        id: "move-block-down",
        label: "Move block down",
        groupLabel: "Preview",
        shortcut: { key: "ArrowDown", withAlt: true },
        icon: "ArrowDown",
        checkIfAvailable: () => {
          const ctx = previewStore.getSnapshot().context;
          if (ctx.isContentLocked || ctx.isPresentationMode) return false;
          const blockCrumb = ctx.selectionBreadcrumbs.find((b) => b.type === "Block");
          if (!blockCrumb || !page) return false;
          if (isLayoutBlockId(page, blockCrumb.id)) return false;
          const index = page.blocks.findIndex((b) => String(b.id) === blockCrumb.id);
          return index !== -1 && index < page.blocks.length - 1;
        },
        execute: () => {
          const blockCrumb = previewStore
            .getSnapshot()
            .context.selectionBreadcrumbs.find((b) => b.type === "Block");
          if (!blockCrumb || !page) return;
          const index = page.blocks.findIndex((b) => String(b.id) === blockCrumb.id);
          if (index === -1 || index >= page.blocks.length - 1) return;

          const afterPosition = page.blocks[index + 1].position;
          const beforePosition =
            index + 2 < page.blocks.length ? page.blocks[index + 2].position : undefined;

          updatePositionMutation
            .mutateAsync({ id: Number(blockCrumb.id), afterPosition, beforePosition })
            .then(
              () => {},
              () => toast.error("Could not move block"),
            );
        },
      },
      {
        id: "add-block-below",
        label: "Add block below",
        groupLabel: "Preview",
        shortcut: { key: "o" },
        checkIfAvailable: () => {
          const ctx = previewStore.getSnapshot().context;
          if (ctx.isContentLocked || ctx.isPresentationMode) return false;
          return ctx.selectionBreadcrumbs.find((b) => b.type === "Block") !== null;
        },
        execute: () => {
          const blockCrumb = previewStore
            .getSnapshot()
            .context.selectionBreadcrumbs.find((b) => b.type === "Block");
          if (!blockCrumb || !page) return;
          const block = page.blocks.find((b) => String(b.id) === blockCrumb.id);
          if (!block) return;

          previewStore.send({
            type: "openAddBlockSheet",
            afterPosition: block.position,
          });
        },
      },
      {
        id: "add-block-above",
        label: "Add block above",
        groupLabel: "Preview",
        shortcut: { key: "o", withShift: true },
        checkIfAvailable: () => {
          const ctx = previewStore.getSnapshot().context;
          if (ctx.isContentLocked || ctx.isPresentationMode) return false;
          return ctx.selectionBreadcrumbs.find((b) => b.type === "Block") !== null;
        },
        execute: () => {
          const blockCrumb = previewStore
            .getSnapshot()
            .context.selectionBreadcrumbs.find((b) => b.type === "Block");
          if (!blockCrumb || !page) return;
          const blockIndex = page.blocks.findIndex((b) => String(b.id) === blockCrumb.id);
          if (blockIndex === -1) return;

          const afterPosition = blockIndex > 0 ? page.blocks[blockIndex - 1].position : "";

          previewStore.send({
            type: "openAddBlockSheet",
            afterPosition,
          });
        },
      },
    ] satisfies Action[];

    actionsStore.send({ type: "registerManyActions", actions });

    return () => {
      actionsStore.send({
        type: "unregisterManyActions",
        ids: actions.map((a) => a.id),
      });
    };
  }, [selectionBreadcrumbs, page, camoxApp]);
}

export { BlockActionsPopover, useBlockActionsShortcuts };
