import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND } from "lexical";
import * as React from "react";

import type { OverlayMessage } from "../../../features/preview/overlayMessages";
import { isOverlayMessage, postOverlayMessage } from "../../../features/preview/overlayMessages";
import { TEXT_MODIFIERS } from "../../lib/modifiers";

interface SelectionBroadcasterProps {
  targetWindow: Window;
}

export function SelectionBroadcaster({ targetWindow }: SelectionBroadcasterProps) {
  const [editor] = useLexicalComposerContext();

  const broadcastSelection = React.useCallback(() => {
    // Use the native selection as the source of truth for whether text is selected,
    // since Lexical's internal state can lag behind on mouseup / double-click / triple-click.
    const nativeSelection = targetWindow.getSelection();
    const hasNativeSelection =
      nativeSelection != null && nativeSelection.rangeCount > 0 && !nativeSelection.isCollapsed;

    if (!hasNativeSelection) {
      postOverlayMessage({
        type: "CAMOX_TEXT_SELECTION_STATE",
        hasSelection: false,
        activeFormats: 0,
      });
      return;
    }

    // Read format flags from Lexical's state
    let format = 0;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      for (const modifier of Object.values(TEXT_MODIFIERS)) {
        const key = modifier === TEXT_MODIFIERS.bold ? "bold" : "italic";
        if (selection.hasFormat(key as any)) {
          format |= modifier.formatFlag;
        }
      }
    });

    postOverlayMessage({
      type: "CAMOX_TEXT_SELECTION_STATE",
      hasSelection: true,
      activeFormats: format,
    });
  }, [editor, targetWindow]);

  // Listen to the native selectionchange event — fires for drag, click,
  // double-click, triple-click, keyboard selection, and programmatic changes.
  React.useEffect(() => {
    const doc = targetWindow.document;
    const handleSelectionChange = () => broadcastSelection();
    doc.addEventListener("selectionchange", handleSelectionChange);
    return () => doc.removeEventListener("selectionchange", handleSelectionChange);
  }, [targetWindow, broadcastSelection]);

  // Listen for format commands from CMS side
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as OverlayMessage;
      if (!isOverlayMessage(data) || data.type !== "CAMOX_FORMAT_TEXT") return;

      // Only the editor that owns the current selection should handle this.
      // Check if the native selection falls within this editor's root element.
      const root = editor.getRootElement();
      const nativeSelection = targetWindow.getSelection();
      if (!root || !nativeSelection || nativeSelection.rangeCount === 0) return;
      if (!root.contains(nativeSelection.anchorNode)) return;

      root.focus();
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, data.formatKey as any);
      // Re-broadcast after formatting so toggle state updates
      setTimeout(broadcastSelection, 10);
    };

    targetWindow.addEventListener("message", handleMessage);
    return () => targetWindow.removeEventListener("message", handleMessage);
  }, [editor, targetWindow, broadcastSelection]);

  return null;
}
