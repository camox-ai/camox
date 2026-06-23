import { ButtonGroup } from "@camox/ui/button-group";
import { FloatingToolbar } from "@camox/ui/floating-toolbar";
import { Label } from "@camox/ui/label";
import { Switch } from "@camox/ui/switch";
import { Toggle } from "@camox/ui/toggle";
import * as Tooltip from "@camox/ui/tooltip";
import { useSelector } from "@xstate/store-react";
import { Monitor, Smartphone, Tablet } from "lucide-react";

import { cn, getActionShortcut } from "@/lib/utils";

import { actionsStore } from "../../provider/actionsStore";
import { previewStore } from "../previewStore";

export const PreviewToolbar = () => {
  const isPresentationMode = useSelector(previewStore, (state) => state.context.isPresentationMode);
  const isAddBlockSheetOpen = useSelector(
    previewStore,
    (state) => state.context.isAddBlockSheetOpen,
  );
  const isAgentChatSheetOpen = useSelector(
    previewStore,
    (state) => state.context.isAgentChatSheetOpen,
  );
  const isAnySideSheetOpen = !isPresentationMode && (isAddBlockSheetOpen || isAgentChatSheetOpen);
  const actions = useSelector(actionsStore, (state) => state.context.actions);
  const viewportMode = useSelector(previewStore, (state) => state.context.viewportMode);
  const presentationModeActionId = isPresentationMode
    ? "exit-presentation-mode"
    : "enter-presentation-mode";

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
          checked={!isPresentationMode}
          onCheckedChange={(checked) => {
            previewStore.send({
              type: checked ? "exitPresentationMode" : "enterPresentationMode",
            });
          }}
        />
        <Label htmlFor="edit-mode" className="flex items-center gap-2">
          Edit mode {getActionShortcut(actions, presentationModeActionId)}
        </Label>
      </div>
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
    </FloatingToolbar>
  );
};
