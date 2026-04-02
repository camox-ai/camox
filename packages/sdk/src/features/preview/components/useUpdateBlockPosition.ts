import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useSelector } from "@xstate/store/react";
import { generateKeyBetween } from "fractional-indexing";

import { type PageWithBlocks, blockMutations, pageQueries } from "@/lib/queries";

import { previewStore } from "../previewStore";

export function useUpdateBlockPosition() {
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const peekedPagePathname = useSelector(previewStore, (state) => state.context.peekedPagePathname);
  const pagePathname = peekedPagePathname ?? pathname;

  return useMutation({
    ...blockMutations.updatePosition(),
    onMutate: (variables) => {
      const queryOptions = pageQueries.getByPath(pagePathname);
      const previousPage = queryClient.getQueryData<PageWithBlocks>(queryOptions.queryKey);

      if (previousPage) {
        const blockToMove = previousPage.blocks.find((b) => b.id === variables.id);
        if (blockToMove) {
          const newPosition = generateKeyBetween(
            variables.afterPosition ?? null,
            variables.beforePosition ?? null,
          );
          const movedBlock = { ...blockToMove, position: newPosition };
          const newBlocks = previousPage.blocks
            .map((b) => (b.id === variables.id ? movedBlock : b))
            .sort((a, b) => a.position.localeCompare(b.position));

          // Re-derive blockIds from sorted page blocks
          const pageBlockIdSet = new Set(previousPage.page.blockIds);
          const newBlockIds = newBlocks.filter((b) => pageBlockIdSet.has(b.id)).map((b) => b.id);

          queryClient.setQueryData<PageWithBlocks>(queryOptions.queryKey, {
            ...previousPage,
            page: { ...previousPage.page, blockIds: newBlockIds },
            blocks: newBlocks,
          });
        }
      }

      queryClient.cancelQueries({ queryKey: queryOptions.queryKey });
      return { previousPage };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousPage) {
        queryClient.setQueryData(
          pageQueries.getByPath(pagePathname).queryKey,
          context.previousPage,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: pageQueries.getByPath(pagePathname).queryKey });
    },
  });
}
