import { useSelector } from "@xstate/store/react";

import { previewStore } from "@/features/preview/previewStore";
import { useIsAuthenticated } from "@/lib/auth";

export function useIsEditable(mode: "site" | "peek" | "layout") {
  const isAuthenticated = useIsAuthenticated();
  const isPresentationMode = useSelector(previewStore, (state) => state.context.isPresentationMode);
  const isContentLocked = useSelector(previewStore, (state) => state.context.isContentLocked);
  return (
    isAuthenticated &&
    (mode === "site" || mode === "layout") &&
    !isPresentationMode &&
    !isContentLocked
  );
}
