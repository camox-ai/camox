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
          const siblings = previousPage.blocks.filter((b) => b.id !== variables.id);
          const newPosition = generateKeyBetween(
            variables.afterPosition ?? null,
            variables.beforePosition ?? null,
          );
          const movedBlock = { ...blockToMove, position: newPosition };
          const newBlocks = [...siblings, movedBlock].sort((a, b) =>
            a.position.localeCompare(b.position),
          );
          queryClient.setQueryData<PageWithBlocks>(queryOptions.queryKey, {
            ...previousPage,
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
