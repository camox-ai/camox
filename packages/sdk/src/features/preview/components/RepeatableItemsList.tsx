import { Button } from "@camox/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@camox/ui/tooltip";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSelector } from "@xstate/store/react";
import { CircleMinus, CirclePlus, GripVertical } from "lucide-react";

import { useApiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import type { OverlayMessage } from "../overlayMessages";
import { previewStore } from "../previewStore";

/* -------------------------------------------------------------------------------------------------
 * SortableRepeatableItem
 * -----------------------------------------------------------------------------------------------*/

type RepeatableItem = {
  _id: string;
  summary: string;
  position: string;
  content: Record<string, unknown>;
};

interface SortableRepeatableItemProps {
  item: RepeatableItem;
  blockId: string;
  fieldName: string;
  canRemove: boolean;
  onRemove: (itemId: string) => void;
}

const SortableRepeatableItem = ({
  item,
  blockId,
  fieldName,
  canRemove,
  onRemove,
}: SortableRepeatableItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Check if this item is currently selected
  const selectionBreadcrumbs = useSelector(
    previewStore,
    (state) => state.context.selectionBreadcrumbs,
  );
  const iframeElement = useSelector(previewStore, (state) => state.context.iframeElement);
  const isSelected = selectionBreadcrumbs.some(
    (b) => b.type === "RepeatableObject" && b.id === item._id,
  );

  const shouldShowHover = !isDragging && !isSelected;

  const handleMouseEnter = () => {
    if (!iframeElement?.contentWindow) return;
    const message: OverlayMessage = {
      type: "CAMOX_HOVER_REPEATER_ITEM",
      blockId,
      itemId: item._id,
    };
    iframeElement.contentWindow.postMessage(message, "*");
  };

  const handleMouseLeave = () => {
    if (!iframeElement?.contentWindow) return;
    const message: OverlayMessage = {
      type: "CAMOX_HOVER_REPEATER_ITEM_END",
      blockId,
      itemId: item._id,
    };
    iframeElement.contentWindow.postMessage(message, "*");
  };

  return (
    <li>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "flex flex-row justify-between items-center gap-2 px-1 py-1 max-w-full rounded-lg text-foreground transition-none group",
          shouldShowHover && "hover:bg-accent/75",
          isSelected && "bg-accent text-accent-foreground",
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground flex cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </Button>

        <div className="flex flex-1 items-center gap-1 overflow-x-hidden">
          <p
            className="flex-1 cursor-default truncate py-1 text-sm"
            title={item.summary}
            onClick={() => {
              // Clear hover overlay before unmounting — mouseLeave won't fire
              handleMouseLeave();
              previewStore.send({
                type: "drillIntoRepeatableItem",
                itemId: item._id,
                fieldName,
              });
            }}
          >
            {item.summary}
          </p>
        </div>

        {canRemove && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground hidden shrink-0 group-focus-within:flex group-hover:flex"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item._id);
                }}
              >
                <CircleMinus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Remove item</TooltipContent>
          </Tooltip>
        )}
      </div>
    </li>
  );
};

/* -------------------------------------------------------------------------------------------------
 * RepeatableItemsList
 * -----------------------------------------------------------------------------------------------*/

/* -------------------------------------------------------------------------------------------------
 * Inline item helpers
 * -----------------------------------------------------------------------------------------------*/

const getInlineItemLabel = (item: Record<string, unknown>, index: number): string => {
  for (const value of Object.values(item)) {
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object" && "text" in value) {
      const text = (value as any).text;
      if (typeof text === "string" && text.trim()) return text;
    }
  }
  return `Item ${index + 1}`;
};

/* -------------------------------------------------------------------------------------------------
 * SortableInlineRepeatableItem — drag-and-drop with index-based identification
 * -----------------------------------------------------------------------------------------------*/

interface SortableInlineRepeatableItemProps {
  item: Record<string, unknown>;
  index: number;
  blockId: string;
  parentItemId: string;
  fieldName: string;
  canRemove: boolean;
  onRemove: (index: number) => void;
}

const SortableInlineRepeatableItem = ({
  item,
  index,
  blockId,
  parentItemId,
  fieldName,
  canRemove,
  onRemove,
}: SortableInlineRepeatableItemProps) => {
  const sortableId = `idx:${index}`;
  const label = getInlineItemLabel(item, index);
  const nestedItemId = `nested:${parentItemId}:${fieldName}:${index}`;

  const iframeElement = useSelector(previewStore, (state) => state.context.iframeElement);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleMouseEnter = () => {
    if (!iframeElement?.contentWindow) return;
    const message: OverlayMessage = {
      type: "CAMOX_HOVER_REPEATER_ITEM",
      blockId,
      itemId: nestedItemId,
    };
    iframeElement.contentWindow.postMessage(message, "*");
  };

  const handleMouseLeave = () => {
    if (!iframeElement?.contentWindow) return;
    const message: OverlayMessage = {
      type: "CAMOX_HOVER_REPEATER_ITEM_END",
      blockId,
      itemId: nestedItemId,
    };
    iframeElement.contentWindow.postMessage(message, "*");
  };

  return (
    <li>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "flex flex-row justify-between items-center gap-2 px-1 py-1 max-w-full rounded-lg text-foreground transition-none group",
          !isDragging && "hover:bg-accent/75",
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground flex cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </Button>

        <div className="flex flex-1 items-center gap-1 overflow-x-hidden">
          <p
            className="flex-1 cursor-default truncate py-1 text-sm"
            title={label}
            onClick={() => {
              handleMouseLeave();
              previewStore.send({
                type: "drillIntoRepeatableItem",
                itemId: sortableId,
                fieldName,
              });
            }}
          >
            {label}
          </p>
        </div>

        {canRemove && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground hidden shrink-0 group-focus-within:flex group-hover:flex"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(index);
                }}
              >
                <CircleMinus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Remove item</TooltipContent>
          </Tooltip>
        )}
      </div>
    </li>
  );
};

/* -------------------------------------------------------------------------------------------------
 * RepeatableItemsList
 * -----------------------------------------------------------------------------------------------*/

interface RepeatableItemsListProps {
  items: RepeatableItem[] | Record<string, unknown>[];
  blockId: string;
  fieldName: string;
  minItems?: number;
  maxItems?: number;
  schema: unknown;
  /** When set, items are inline objects managed through the parent item's content */
  parentItemId?: string;
}

const RepeatableItemsList = ({
  items,
  blockId,
  fieldName,
  minItems,
  maxItems,
  schema,
  parentItemId,
}: RepeatableItemsListProps) => {
  const isInline = !!parentItemId;
  const apiClient = useApiClient();

  const canAdd = maxItems === undefined || items.length < maxItems;
  const canRemove = minItems === undefined || items.length > minItems;

  const handleAddItem = () => {
    const defaultContent: Record<string, unknown> = {};
    const itemsSchema = (schema as any)?.items;
    if (itemsSchema?.properties) {
      for (const [key, prop] of Object.entries(itemsSchema.properties)) {
        const ft = (prop as any).fieldType;
        if (ft === "Image" || ft === "File") continue;
        if ("default" in (prop as any)) {
          defaultContent[key] = (prop as { default: unknown }).default;
        }
      }
    }
    apiClient.repeatableItems.create.$post({
      json: { blockId: Number(blockId), fieldName, content: defaultContent },
    });
  };

  const handleRemoveItem = (itemId: string) => {
    apiClient.repeatableItems.delete.$post({ json: { id: Number(itemId) } });
  };

  const handleAddInlineItem = () => {
    if (!parentItemId) return;
    const defaultContent: Record<string, unknown> = {};
    const itemsSchema = (schema as any)?.items;
    if (itemsSchema?.properties) {
      for (const [key, prop] of Object.entries(itemsSchema.properties)) {
        const ft = (prop as any).fieldType;
        if (ft === "Image" || ft === "File") continue;
        if ("default" in (prop as any)) {
          defaultContent[key] = (prop as { default: unknown }).default;
        }
      }
    }
    const currentItems = items as Record<string, unknown>[];
    apiClient.repeatableItems.updateContent.$post({
      json: {
        id: Number(parentItemId),
        content: { [fieldName]: [...currentItems, defaultContent] },
      },
    });
  };

  const handleRemoveInlineItem = (index: number) => {
    if (!parentItemId) return;
    const currentItems = items as Record<string, unknown>[];
    apiClient.repeatableItems.updateContent.$post({
      json: {
        id: Number(parentItemId),
        content: { [fieldName]: currentItems.filter((_, i) => i !== index) },
      },
    });
  };

  const handleInlineDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !parentItemId) return;

    const oldIndex = parseInt((active.id as string).slice(4), 10);
    const newIndex = parseInt((over.id as string).slice(4), 10);
    if (isNaN(oldIndex) || isNaN(newIndex)) return;

    const currentItems = [...(items as Record<string, unknown>[])];
    const [moved] = currentItems.splice(oldIndex, 1);
    currentItems.splice(newIndex, 0, moved);

    apiClient.repeatableItems.updateContent.$post({
      json: { id: Number(parentItemId), content: { [fieldName]: currentItems } },
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const dbItems = items as RepeatableItem[];

    // Find the old and new indices
    const oldIndex = dbItems.findIndex((item) => item._id === active.id);
    const newIndex = dbItems.findIndex((item) => item._id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Determine afterPosition and beforePosition based on new index
    // When dragging down (oldIndex < newIndex), the item is inserted after newIndex
    // When dragging up (oldIndex > newIndex), the item is inserted before newIndex
    let afterPosition: string | undefined;
    let beforePosition: string | undefined;

    if (oldIndex < newIndex) {
      // Dragging down: insert after the target position
      afterPosition = dbItems[newIndex].position;
      beforePosition = newIndex < dbItems.length - 1 ? dbItems[newIndex + 1].position : undefined;
    } else {
      // Dragging up: insert before the target position
      afterPosition = newIndex > 0 ? dbItems[newIndex - 1].position : undefined;
      beforePosition = dbItems[newIndex].position;
    }

    await apiClient.repeatableItems.updatePosition.$post({
      json: { id: Number(active.id), afterPosition, beforePosition },
    });
  };

  return (
    <div className="flex flex-col gap-1">
      {isInline
        ? items.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleInlineDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={(items as Record<string, unknown>[]).map((_, i) => `idx:${i}`)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-1">
                  {(items as Record<string, unknown>[]).map((item, index) => (
                    <SortableInlineRepeatableItem
                      key={index}
                      item={item}
                      index={index}
                      blockId={blockId}
                      parentItemId={parentItemId!}
                      fieldName={fieldName}
                      canRemove={canRemove}
                      onRemove={handleRemoveInlineItem}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )
        : items.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={(items as RepeatableItem[]).map((item) => item._id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-1">
                  {(items as RepeatableItem[]).map((item) => (
                    <SortableRepeatableItem
                      key={item._id}
                      item={item}
                      blockId={blockId}
                      fieldName={fieldName}
                      canRemove={canRemove}
                      onRemove={handleRemoveItem}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

      {canAdd && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground justify-start self-start"
          onClick={isInline ? handleAddInlineItem : handleAddItem}
        >
          <CirclePlus className="h-4 w-4" />
          Add item
        </Button>
      )}
    </div>
  );
};

export { RepeatableItemsList };
