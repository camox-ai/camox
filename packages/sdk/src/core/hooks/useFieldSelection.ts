import { useSelector } from "@xstate/store/react";

import { previewStore } from "../../features/preview/previewStore";
import type { FieldType } from "../lib/fieldTypes.tsx";

/**
 * Returns whether the given field is currently selected based on the normalized selection state.
 *
 * Matches when the selection points to this exact field (type + name + optional repeater item).
 */
export function useFieldSelection(
  blockId: string,
  fieldName: string,
  fieldType: FieldType,
  repeaterItemId?: string,
): boolean {
  return useSelector(previewStore, (state) => {
    const sel = state.context.selection;
    if (!sel || sel.blockId !== blockId) return false;

    // Check for field-level selections
    if (sel.type === "block-field") {
      if (repeaterItemId) return false; // Field is in a repeater but selection is at block level
      return sel.fieldType === fieldType && sel.fieldName === fieldName;
    }

    if (sel.type === "item-field") {
      if (!repeaterItemId) return false; // Field is at block level but selection is in an item
      return (
        sel.itemId === repeaterItemId && sel.fieldType === fieldType && sel.fieldName === fieldName
      );
    }

    return false;
  });
}
