import { useSelector } from "@xstate/store/react";
import { useConvexAuth } from "convex/react";

import { previewStore } from "@/features/preview/previewStore";

export function useIsEditable(mode: "site" | "peek" | "layout") {
  const { isAuthenticated } = useConvexAuth();
  const isPresentationMode = useSelector(previewStore, (state) => state.context.isPresentationMode);
  const isContentLocked = useSelector(previewStore, (state) => state.context.isContentLocked);
  return (
    isAuthenticated &&
    (mode === "site" || mode === "layout") &&
    !isPresentationMode &&
    !isContentLocked
  );
}
