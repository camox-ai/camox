import { Button } from "@camox/ui/button";
import { ButtonGroup } from "@camox/ui/button-group";
import { FloatingToolbar } from "@camox/ui/floating-toolbar";
import { Kbd } from "@camox/ui/kbd";
import { Toggle } from "@camox/ui/toggle";
import * as Tooltip from "@camox/ui/tooltip";
import { useSelector } from "@xstate/store/react";
import { Bold, Italic } from "lucide-react";
import * as React from "react";

import { cn, formatShortcut } from "@/lib/utils";

import { FORMAT_FLAGS } from "../../../core/lib/modifierFormats";
import type { OverlayMessage } from "../overlayMessages";
import { isOverlayMessage } from "../overlayMessages";
import { previewStore } from "../previewStore";
import { useIsPreviewSheetOpen } from "./PreviewSideSheet";

const FORMAT_BUTTONS = [
  { key: "bold", flag: FORMAT_FLAGS.bold, icon: Bold, label: "Bold", shortcut: "⌘ B" },
  { key: "italic", flag: FORMAT_FLAGS.italic, icon: Italic, label: "Italic", shortcut: "⌘ I" },
] as const;

export const FieldToolbar = () => {
  const iframeElement = useSelector(previewStore, (state) => state.context.iframeElement);
  const selection = useSelector(previewStore, (state) => state.context.selection);
  const isAnySideSheetOpen = useIsPreviewSheetOpen();

  const [hasSelection, setHasSelection] = React.useState(false);
  const [activeFormats, setActiveFormats] = React.useState(0);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as OverlayMessage;
      if (!isOverlayMessage(data) || data.type !== "CAMOX_TEXT_SELECTION_STATE") return;

      setHasSelection(data.hasSelection);
      setActiveFormats(data.activeFormats);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const sendFormat = (formatKey: string) => {
    iframeElement?.contentWindow?.postMessage(
      { type: "CAMOX_FORMAT_TEXT", formatKey } satisfies OverlayMessage,
      "*",
    );
  };

  const isOnField = selection?.type === "block-field" || selection?.type === "item-field";
  const isVisible = isOnField && !isAnySideSheetOpen;

  const handleEditInForm = () => {
    if (!selection) return;
    previewStore.send({ type: "openBlockContentSheet", blockId: selection.blockId });
  };

  return (
    <FloatingToolbar
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        "bottom-17 gap-2",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 pointer-events-none translate-y-2",
      )}
    >
      <Button variant="outline" onClick={handleEditInForm}>
        Edit in form
        {formatShortcut({ key: "j", withAlt: true })}
      </Button>
      {hasSelection && (
        <ButtonGroup>
          {FORMAT_BUTTONS.map(({ key, flag, icon: Icon, label, shortcut }) => {
            const isActive = !!(activeFormats & flag);
            return (
              <Tooltip.Tooltip key={key}>
                <Tooltip.TooltipTrigger
                  render={
                    <Toggle
                      data-state={isActive ? "on" : "off"}
                      pressed={isActive}
                      variant="outline"
                      onPressedChange={() => sendFormat(key)}
                    />
                  }
                >
                  <Icon />
                </Tooltip.TooltipTrigger>
                <Tooltip.TooltipContent>
                  {label} <Kbd>{shortcut}</Kbd>
                </Tooltip.TooltipContent>
              </Tooltip.Tooltip>
            );
          })}
        </ButtonGroup>
      )}
    </FloatingToolbar>
  );
};
