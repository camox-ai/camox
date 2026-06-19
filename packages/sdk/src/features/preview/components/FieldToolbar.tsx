import { Button } from "@camox/ui/button";
import { ButtonGroup } from "@camox/ui/button-group";
import { FloatingToolbar } from "@camox/ui/floating-toolbar";
import { Kbd } from "@camox/ui/kbd";
import { Toggle } from "@camox/ui/toggle";
import * as Tooltip from "@camox/ui/tooltip";
import { useSelector } from "@xstate/store-react";
import { Bold, CircleMinus, CirclePlus, Italic } from "lucide-react";
import * as React from "react";

import { TextLinkPopover } from "@/core/components/lexical/TextLinkPopover";
import { cn, formatShortcut } from "@/lib/utils";

import { FORMAT_FLAGS } from "../../../core/lib/modifierFormats";
import type { OverlayMessage } from "../overlayMessages";
import { isOverlayMessage } from "../overlayMessages";
import { previewStore } from "../previewStore";
import { formatFieldName } from "./ItemFieldsEditor";
import { useIsPreviewSheetOpen } from "./PreviewSideSheet";
import { useCurrentItemActions } from "./useRepeatableItemActions";

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
  const [linkTarget, setLinkTarget] = React.useState<string | null>(null);
  const [selectedText, setSelectedText] = React.useState("");
  const [linkPopoverOpen, setLinkPopoverOpen] = React.useState(false);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as OverlayMessage;
      if (!isOverlayMessage(data)) return;

      if (data.type === "CAMOX_TEXT_SELECTION_STATE") {
        setHasSelection(data.hasSelection);
        setActiveFormats(data.activeFormats);
        setLinkTarget(data.linkTarget);
        setSelectedText(data.selectedText);
        return;
      }

      if (data.type === "CAMOX_OPEN_TEXT_LINK_POPOVER") {
        setHasSelection(true);
        setLinkTarget(data.target);
        setSelectedText(data.text);
        setLinkPopoverOpen(true);
      }
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

  const handleLinkPopoverOpenChange = (open: boolean) => {
    setLinkPopoverOpen(open);
  };

  const sendTextLink = (target: string | null, text?: string) => {
    iframeElement?.contentWindow?.postMessage(
      { type: "CAMOX_TOGGLE_TEXT_LINK", target, text } satisfies OverlayMessage,
      "*",
    );
    setLinkPopoverOpen(false);
  };

  const unlinkText = () => {
    sendTextLink(null);
  };

  const isOnField = selection?.type === "block-field" || selection?.type === "item-field";
  const isOnItemField = selection?.type === "item-field";
  const isVisible = isOnField && !isAnySideSheetOpen;

  const itemBlockId = isOnItemField ? selection.blockId : null;
  const itemId = isOnItemField ? selection.itemId : null;
  const { canAdd, addItem, canRemove, removeItem, currentItem } = useCurrentItemActions(
    itemBlockId,
    itemId,
  );

  const handleEditInForm = () => {
    if (!selection) return;
    previewStore.send({ type: "openBlockContentSheet", blockId: selection.blockId });
  };

  const handleToolbarMouseDown = (event: React.MouseEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      event.preventDefault();
      return;
    }

    if (target.closest("input, select, textarea, button, [role='combobox']")) return;

    event.preventDefault();
  };

  return (
    <FloatingToolbar
      onMouseDown={handleToolbarMouseDown}
      className={cn(
        "bottom-17 gap-2",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 pointer-events-none translate-y-2",
      )}
    >
      <Button variant="outline" onClick={handleEditInForm}>
        Edit in form
        {formatShortcut({ key: "j", withAlt: true })}
      </Button>
      {isOnItemField && currentItem && (canAdd || canRemove) && (
        <Tooltip.TooltipProvider delay={0}>
          <ButtonGroup>
            {canAdd && (
              <Tooltip.Tooltip>
                <Tooltip.TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => addItem({ afterPosition: currentItem.position })}
                    />
                  }
                >
                  <CirclePlus />
                </Tooltip.TooltipTrigger>
                <Tooltip.TooltipContent>
                  Add item to {formatFieldName(currentItem.fieldName)}
                </Tooltip.TooltipContent>
              </Tooltip.Tooltip>
            )}
            {canRemove && (
              <Tooltip.Tooltip>
                <Tooltip.TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        removeItem(currentItem.id, {
                          onSuccess: () => previewStore.send({ type: "selectParent" }),
                        })
                      }
                    />
                  }
                >
                  <CircleMinus />
                </Tooltip.TooltipTrigger>
                <Tooltip.TooltipContent>
                  Remove item from {formatFieldName(currentItem.fieldName)}
                </Tooltip.TooltipContent>
              </Tooltip.Tooltip>
            )}
          </ButtonGroup>
        </Tooltip.TooltipProvider>
      )}
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
          <TextLinkPopover
            open={linkPopoverOpen}
            onOpenChange={handleLinkPopoverOpenChange}
            trigger={<Button variant="outline" size="icon" aria-label="Add link" />}
            text={selectedText}
            target={linkTarget}
            onSave={sendTextLink}
            onUnlink={unlinkText}
          />
        </ButtonGroup>
      )}
    </FloatingToolbar>
  );
};
