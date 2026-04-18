import * as Sheet from "@camox/ui/sheet";
import { useSelector } from "@xstate/store/react";
import * as React from "react";

import { SHEET_WIDTH } from "../previewConstants";
import { previewStore } from "../previewStore";

type InitialFocus = React.ComponentProps<typeof Sheet.SheetContent>["initialFocus"];

interface PreviewSideSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFocus?: InitialFocus;
  children: React.ReactNode;
  className?: string;
}

const PreviewSideSheet = ({
  open,
  onOpenChange,
  initialFocus,
  children,
  className,
}: PreviewSideSheetProps) => {
  return (
    <Sheet.Sheet open={open} onOpenChange={onOpenChange}>
      <Sheet.SheetContent
        className={className}
        side="left"
        showOverlay={false}
        style={{ minWidth: SHEET_WIDTH }}
        initialFocus={initialFocus}
      >
        {children}
      </Sheet.SheetContent>
    </Sheet.Sheet>
  );
};

export function useIsPreviewSheetOpen() {
  const isPageContentSheetOpen = useSelector(
    previewStore,
    (state) => state.context.isPageContentSheetOpen,
  );
  const isPeekingBlock = useSelector(previewStore, (state) => state.context.peekedBlock != null);
  const isAgentChatSheetOpen = useSelector(
    previewStore,
    (state) => state.context.isAgentChatSheetOpen,
  );

  return isPageContentSheetOpen || isPeekingBlock || isAgentChatSheetOpen;
}

export { PreviewSideSheet, Sheet as SheetParts };
