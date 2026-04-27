import { queryKeys } from "@camox/api-contract/query-keys";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@camox/ui/command";
import { Tooltip, TooltipContent, TooltipTrigger } from "@camox/ui/tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useSelector } from "@xstate/store/react";
import { generateKeyBetween } from "fractional-indexing";
import { InfoIcon } from "lucide-react";
import * as React from "react";

import type { Block } from "@/core/createBlock";
import { trackClientEvent } from "@/lib/analytics-client";
import { useProjectSlug } from "@/lib/auth";
import { usePageBlocks } from "@/lib/normalized-data";
import {
  type BlockBundle,
  type PageStructure,
  blockMutations,
  blockQueries,
  projectQueries,
} from "@/lib/queries";

import { useCamoxApp } from "../../provider/components/CamoxAppContext";
import { usePreviewedPage } from "../CamoxPreview";
import { previewStore } from "../previewStore";
import { PreviewSideSheet, SheetParts } from "./PreviewSideSheet";

const AddBlockSheet = () => {
  const [highlightedValue, setHighlightedValue] = React.useState<string>("");
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const peekedPagePathname = useSelector(previewStore, (state) => state.context.peekedPagePathname);
  const pagePathname = peekedPagePathname ?? pathname;

  const createBlock = useMutation({
    ...blockMutations.create(),
    onMutate: (variables) => {
      const pageQueryKey = queryKeys.pages.getByPath(pagePathname);
      const previousPage = queryClient.getQueryData<PageStructure>(pageQueryKey);
      if (!previousPage) return {};

      // Read block positions from individual caches for position computation
      const blockIds = previousPage.page.blockIds;
      const pageBlocks = blockIds
        .map((id) => queryClient.getQueryData<BlockBundle>(queryKeys.blocks.get(id))?.block)
        .filter((b) => b != null);
      const { afterPosition } = variables;

      let position: string;
      if (afterPosition == null) {
        const lastBlock = pageBlocks[pageBlocks.length - 1];
        position = generateKeyBetween(lastBlock?.position ?? null, null);
      } else if (afterPosition === "") {
        const firstBlock = pageBlocks[0];
        position = generateKeyBetween(null, firstBlock?.position ?? null);
      } else {
        let afterIndex = -1;
        for (let i = pageBlocks.length - 1; i >= 0; i--) {
          if (String(pageBlocks[i].position) <= afterPosition) {
            afterIndex = i;
            break;
          }
        }
        const nextBlock = afterIndex >= 0 ? pageBlocks[afterIndex + 1] : pageBlocks[0];
        position = generateKeyBetween(
          afterIndex >= 0 ? pageBlocks[afterIndex].position : null,
          nextBlock?.position ?? null,
        );
      }

      const now = Date.now();
      const optimisticId = -now;
      const optimisticBlock = {
        id: optimisticId,
        pageId: variables.pageId,
        layoutId: null,
        type: variables.type,
        content: variables.content as Record<string, unknown>,
        settings: (variables.settings as Record<string, unknown>) ?? null,
        placement: null,
        summary: "",
        position,
        createdAt: now,
        updatedAt: now,
      };

      // Seed the optimistic block's individual cache
      queryClient.setQueryData(queryKeys.blocks.get(optimisticId), {
        block: optimisticBlock,
        repeatableItems: [],
        files: [],
      });

      // Insert at the correct position in blockIds
      const insertIndex = pageBlocks.findIndex((b) => b.position > position);
      const newBlockIds = [...blockIds];
      if (insertIndex === -1) {
        newBlockIds.push(optimisticId);
      } else {
        newBlockIds.splice(insertIndex, 0, optimisticId);
      }

      queryClient.setQueryData<PageStructure>(pageQueryKey, {
        ...previousPage,
        page: { ...previousPage.page, blockIds: newBlockIds },
      });

      queryClient.cancelQueries({ queryKey: pageQueryKey });
      return { previousPage, optimisticId };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousPage) {
        queryClient.setQueryData(queryKeys.pages.getByPath(pagePathname), context.previousPage);
      }
      if (context?.optimisticId) {
        queryClient.removeQueries({ queryKey: queryKeys.blocks.get(context.optimisticId) });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pages.getByPath(pagePathname) });
    },
  });

  const projectSlug = useProjectSlug();
  const { data: project } = useQuery(projectQueries.getBySlug(projectSlug));
  const availableBlocks = useCamoxApp()
    .getBlocks()
    .filter((b) => !b._internal.layoutOnly);
  const page = usePreviewedPage();
  const { pageBlocks } = usePageBlocks(page);
  const { data: totalCounts = {} } = useQuery({
    ...blockQueries.getUsageCounts(project?.id ?? 0),
    enabled: !!project,
  });

  const pageCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    if (!page) return counts;
    for (const block of pageBlocks) {
      counts[block.type] = (counts[block.type] ?? 0) + 1;
    }
    return counts;
  }, [page, pageBlocks]);

  const isOpen = useSelector(previewStore, (state) => state.context.isAddBlockSheetOpen);
  const peekedBlockPosition = useSelector(
    previewStore,
    (state) => state.context.peekedBlockPosition,
  );

  const handleAddBlock = async (block: Block) => {
    if (!page) return;

    const afterPosition =
      peekedBlockPosition === ""
        ? ""
        : (peekedBlockPosition ?? pageBlocks[pageBlocks.length - 1]?.position);

    const bundle = block._internal.getInitialBundle();
    const { id: blockId } = await createBlock.mutateAsync({
      pageId: page.page.id,
      type: block._internal.id,
      content: bundle.content,
      settings: bundle.settings,
      afterPosition,
      repeatableItems: bundle.repeatableItems,
    });
    trackClientEvent("block_added", {
      projectId: page.page.projectId,
      blockType: block._internal.id,
    });
    previewStore.send({ type: "focusCreatedBlock", blockId });
    previewStore.send({ type: "exitPeekedBlock" });
  };

  const handlePreviewBlock = (block: Block) => {
    const afterPosition =
      peekedBlockPosition === ""
        ? ""
        : (peekedBlockPosition ?? pageBlocks[pageBlocks.length - 1]?.position);

    previewStore.send({ type: "setPeekedBlock", block, afterPosition });
  };

  const handleValueChange = (value: string) => {
    setHighlightedValue(value);
    const block = availableBlocks.find((b: Block) => b._internal.title === value);
    if (block) {
      handlePreviewBlock(block);
    } else {
      previewStore.send({ type: "clearPeekedBlock" });
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      previewStore.send({ type: "closeAddBlockSheet" });
    }
  };

  // Reset highlighted value when sheet opens
  React.useEffect(() => {
    if (isOpen) {
      setHighlightedValue("");
    }
  }, [isOpen]);

  const displayCount = (blockId: Block["_internal"]["id"]) => {
    const total = totalCounts[blockId] ?? 0;
    if (total === 0) return "Never used";
    const page = pageCounts[blockId] ?? "none";
    return `${total} use${total > 1 ? "s" : ""} (${page} here)`;
  };

  return (
    <PreviewSideSheet open={isOpen} onOpenChange={handleOpenChange} className="flex flex-col gap-0">
      <SheetParts.SheetHeader className="border-border border-b">
        <SheetParts.SheetTitle>Add new block</SheetParts.SheetTitle>
        <SheetParts.SheetDescription>
          Search and select a block to add to the page.
        </SheetParts.SheetDescription>
      </SheetParts.SheetHeader>
      <div className="flex-1 overflow-auto p-2">
        <Command
          value={highlightedValue}
          onValueChange={handleValueChange}
          className="overflow-visible"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              previewStore.send({ type: "closeAddBlockSheet" });
            }
          }}
        >
          <CommandInput placeholder="Search blocks..." autoFocus />
          <CommandList className="mt-1 max-h-full">
            <CommandEmpty>No blocks found.</CommandEmpty>
            <CommandGroup>
              {availableBlocks
                .sort(
                  (a, b) => (totalCounts[b._internal.id] ?? 0) - (totalCounts[a._internal.id] ?? 0),
                )
                .map((block: Block) => (
                  <CommandItem
                    key={block._internal.id}
                    value={block._internal.title}
                    onSelect={() => {
                      handleAddBlock(block);
                    }}
                    className="group flex items-center justify-between gap-2"
                  >
                    <div className="flex-1">
                      <span>{block._internal.title}</span>
                      <span className="text-muted-foreground block">
                        {displayCount(block._internal.id)}
                      </span>
                    </div>
                    <Tooltip>
                      <TooltipTrigger className="hidden group-focus-within:flex group-hover:flex">
                        <InfoIcon />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[300px]" side="right">
                        {block._internal.description}
                      </TooltipContent>
                    </Tooltip>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </PreviewSideSheet>
  );
};

export { AddBlockSheet };
