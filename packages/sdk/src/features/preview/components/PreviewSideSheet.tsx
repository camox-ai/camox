import * as Sheet from "@camox/ui/sheet";
import { useSelector } from "@xstate/store-react";
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
  keepMounted?: boolean;
  showCloseButton?: boolean;
}

const PreviewSideSheet = ({
  open,
  onOpenChange,
  initialFocus,
  children,
  className,
  keepMounted,
  showCloseButton,
}: PreviewSideSheetProps) => {
  return (
    <Sheet.Sheet open={open} onOpenChange={onOpenChange}>
      <Sheet.SheetContent
        className={className}
        side="left"
        showOverlay={false}
        style={{ minWidth: SHEET_WIDTH }}
        initialFocus={initialFocus}
        keepMounted={keepMounted}
        showCloseButton={showCloseButton}
      >
        {children}
      </Sheet.SheetContent>
    </Sheet.Sheet>
  );
};

export function useIsPreviewSheetOpen() {
  const isAgentChatSheetOpen = useSelector(
    previewStore,
    (state) => state.context.isAgentChatSheetOpen,
  );

  return isAgentChatSheetOpen;
}

export { PreviewSideSheet, Sheet as SheetParts };
