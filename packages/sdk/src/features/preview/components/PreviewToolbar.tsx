import { ButtonGroup } from "@camox/ui/button-group";
import { FloatingToolbar } from "@camox/ui/floating-toolbar";
import { Label } from "@camox/ui/label";
import { Switch } from "@camox/ui/switch";
import { Toggle } from "@camox/ui/toggle";
import * as Tooltip from "@camox/ui/tooltip";
import { useSelector } from "@xstate/store-react";
import { Monitor, Smartphone } from "lucide-react";

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
  const isMobileMode = useSelector(previewStore, (state) => state.context.isMobileMode);
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
          Edit page {getActionShortcut(actions, presentationModeActionId)}
        </Label>
      </div>
      <ButtonGroup>
        <Tooltip.Tooltip>
          <Tooltip.TooltipTrigger
            render={
              <Toggle
                data-state={isMobileMode ? "off" : "on"}
                pressed={!isMobileMode}
                onPressedChange={() => {
                  if (!isMobileMode) return;
                  previewStore.send({ type: "toggleMobileMode" });
                }}
                variant="outline"
              />
            }
          >
            <Monitor />
          </Tooltip.TooltipTrigger>
          <Tooltip.TooltipContent>
            Desktop view {getActionShortcut(actions, "toggle-mobile-mode")}
          </Tooltip.TooltipContent>
        </Tooltip.Tooltip>
        <Tooltip.Tooltip>
          <Tooltip.TooltipTrigger
            render={
              <Toggle
                data-state={isMobileMode ? "on" : "off"}
                pressed={isMobileMode}
                onPressedChange={() => {
                  if (isMobileMode) return;
                  previewStore.send({ type: "toggleMobileMode" });
                }}
                variant="outline"
              />
            }
          >
            <Smartphone />
          </Tooltip.TooltipTrigger>
          <Tooltip.TooltipContent>
            Mobile view {getActionShortcut(actions, "toggle-mobile-mode")}
          </Tooltip.TooltipContent>
        </Tooltip.Tooltip>
      </ButtonGroup>
    </FloatingToolbar>
  );
};
