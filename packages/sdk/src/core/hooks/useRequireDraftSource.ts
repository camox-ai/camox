import * as React from "react";

import { previewStore } from "@/features/preview/previewStore";

/**
 * Gate any edit attempt on the current preview source. If the studio is
 * previewing 'draft', `requireDraft()` returns true and the caller proceeds.
 * Otherwise it opens the "Switch to draft to edit?" dialog and returns false
 * so the caller aborts. The dialog's CTA only switches the source — it does
 * not retry the original attempt; the user re-issues the edit themselves.
 */
export function useRequireDraftSource() {
  return React.useCallback(() => {
    const ctx = previewStore.getSnapshot().context;
    if (ctx.previewSource === "draft") return true;
    previewStore.send({ type: "requestDraftSwitch" });
    return false;
  }, []);
}
