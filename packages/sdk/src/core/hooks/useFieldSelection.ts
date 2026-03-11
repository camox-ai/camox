import { useSelector } from "@xstate/store/react";

import { previewStore } from "../../features/preview/previewStore";
import type { FieldType } from "../lib/fieldTypes.tsx";

/**
 * Returns whether the given field is currently selected based on selectionBreadcrumbs.
 *
 * Matches when the breadcrumb trail contains:
 * 1. A Block crumb matching `blockId`
 * 2. (Optionally) a RepeatableObject crumb matching the repeater context
 * 3. A crumb matching `fieldType` and `fieldName`
 */
export function useFieldSelection(
  blockId: string,
  fieldName: string,
  fieldType: FieldType,
  repeaterItemId?: string,
): boolean {
  return useSelector(previewStore, (state) => {
    const crumbs = state.context.selectionBreadcrumbs;
    if (crumbs.length === 0) return false;

    // First crumb must be our block
    if (crumbs[0]?.type !== "Block" || crumbs[0]?.id !== blockId) return false;

    // Find a crumb matching our field type and name
    const fieldCrumb = crumbs.find(
      (c) => c.type === fieldType && (c.id === fieldName || c.fieldName === fieldName),
    );
    if (!fieldCrumb) return false;

    // If we're in a repeater, verify the repeater item matches
    if (repeaterItemId) {
      const repeaterCrumb = crumbs.find(
        (c) => c.type === "RepeatableObject" && c.id === repeaterItemId,
      );
      if (!repeaterCrumb) return false;
    }

    return true;
  });
}
