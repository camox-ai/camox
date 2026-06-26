import { Button } from "@camox/ui/button";
import { ButtonGroup } from "@camox/ui/button-group";
import { FloatingToolbar } from "@camox/ui/floating-toolbar";
import { Label } from "@camox/ui/label";
import { Switch } from "@camox/ui/switch";
import { Toggle } from "@camox/ui/toggle";
import * as Tooltip from "@camox/ui/tooltip";
import { useSelector } from "@xstate/store-react";
import { Monitor, Smartphone, Tablet, X } from "lucide-react";

import { cn, getActionShortcut } from "@/lib/utils";

import { actionsStore } from "../../provider/actionsStore";
import { previewStore } from "../previewStore";

interface PreviewToolbarProps {
  onEditModeChange?: (checked: boolean) => void;
}

export const PreviewToolbar = ({ onEditModeChange }: PreviewToolbarProps) => {
  const isEditMode = useSelector(previewStore, (state) => state.context.isEditMode);
  const isToolbarHidden = useSelector(previewStore, (state) => state.context.isToolbarHidden);
  const isAddBlockSheetOpen = useSelector(
    previewStore,
    (state) => state.context.isAddBlockSheetOpen,
  );
  const isAnySideSheetOpen = isEditMode && isAddBlockSheetOpen;
  const actions = useSelector(actionsStore, (state) => state.context.actions);
  const viewportMode = useSelector(previewStore, (state) => state.context.viewportMode);
  const editModeActionId = isEditMode ? "exit-edit-mode" : "enter-edit-mode";

  if (isToolbarHidden) return null;

  return (
    <FloatingToolbar
      className={cn(
        "bottom-2 gap-8 justify-between",
        isAnySideSheetOpen && "opacity-0 pointer-events-none translate-y-full",
      )}
    >
      <div className="flex items-center gap-2 px-2">
        <Switch
          id="edit-mode"
          checked={isEditMode}
          onCheckedChange={(checked) => {
            if (onEditModeChange) {
              onEditModeChange(checked);
              return;
            }

            previewStore.send({
              type: checked ? "enterEditMode" : "exitEditMode",
            });
          }}
        />
        <Label htmlFor="edit-mode" className="flex items-center gap-2">
          Edit mode {getActionShortcut(actions, editModeActionId)}
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <ButtonGroup>
          <Tooltip.Tooltip>
            <Tooltip.TooltipTrigger
              render={
                <Toggle
                  data-state={viewportMode === "full" ? "on" : "off"}
                  pressed={viewportMode === "full"}
                  onPressedChange={() => {
                    if (viewportMode === "full") return;
                    previewStore.send({ type: "setViewportMode", mode: "full" });
                  }}
                  variant="outline"
                />
              }
            >
              <Monitor />
            </Tooltip.TooltipTrigger>
            <Tooltip.TooltipContent>Full view</Tooltip.TooltipContent>
          </Tooltip.Tooltip>
          <Tooltip.Tooltip>
            <Tooltip.TooltipTrigger
              render={
                <Toggle
                  data-state={viewportMode === "tablet" ? "on" : "off"}
                  pressed={viewportMode === "tablet"}
                  onPressedChange={() => {
                    if (viewportMode === "tablet") return;
                    previewStore.send({ type: "setViewportMode", mode: "tablet" });
                  }}
                  variant="outline"
                />
              }
            >
              <Tablet />
            </Tooltip.TooltipTrigger>
            <Tooltip.TooltipContent>Tablet view</Tooltip.TooltipContent>
          </Tooltip.Tooltip>
          <Tooltip.Tooltip>
            <Tooltip.TooltipTrigger
              render={
                <Toggle
                  data-state={viewportMode === "mobile" ? "on" : "off"}
                  pressed={viewportMode === "mobile"}
                  onPressedChange={() => {
                    if (viewportMode === "mobile") return;
                    previewStore.send({ type: "setViewportMode", mode: "mobile" });
                  }}
                  variant="outline"
                />
              }
            >
              <Smartphone />
            </Tooltip.TooltipTrigger>
            <Tooltip.TooltipContent>Mobile view</Tooltip.TooltipContent>
          </Tooltip.Tooltip>
        </ButtonGroup>
        <Tooltip.Tooltip>
          <Tooltip.TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={isEditMode}
                onClick={() => previewStore.send({ type: "hideToolbar" })}
                aria-label="Hide toolbar"
                className="text-muted-foreground"
              />
            }
          >
            <X />
          </Tooltip.TooltipTrigger>
          <Tooltip.TooltipContent>Hide toolbar</Tooltip.TooltipContent>
        </Tooltip.Tooltip>
      </div>
    </FloatingToolbar>
  );
};
