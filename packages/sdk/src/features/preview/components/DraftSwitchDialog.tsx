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
import { useSelector } from "@xstate/store-react";

import { previewStore } from "../previewStore";

/**
 * Global confirmation that the user wants to leave a non-draft preview
 * before editing. The CTA only flips `previewSource` to `'draft'` — the
 * original edit attempt is intentionally NOT replayed; the user re-issues it
 * once back on draft. This keeps the action explicit and avoids "magical"
 * delayed edits the user might no longer want.
 */
export function DraftSwitchDialog() {
  const open = useSelector(previewStore, (state) => state.context.isDraftSwitchDialogOpen);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) previewStore.send({ type: "dismissDraftSwitch" });
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Switch to draft to edit?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;re previewing the live version. Switch to the draft to make changes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" size="default">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              previewStore.send({ type: "setPreviewSource", source: "draft" });
              previewStore.send({ type: "dismissDraftSwitch" });
            }}
          >
            Switch to draft
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
