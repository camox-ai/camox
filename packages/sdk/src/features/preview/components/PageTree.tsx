import { Accordion } from "@base-ui/react/accordion";
import { Button } from "@camox/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@camox/ui/tooltip";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  defaultAnimateLayoutChanges,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "@xstate/store/react";
import { Ellipsis, GripVertical, LayoutTemplate, Plus, Type } from "lucide-react";
import * as React from "react";

import { fieldTypesDictionary } from "@/core/lib/fieldTypes";
import { type NormalizedBlock, usePageBlocks } from "@/lib/normalized-data";
import { blockQueries } from "@/lib/queries";
import { cn } from "@/lib/utils";

import { useCamoxApp } from "../../provider/components/CamoxAppContext";
import { usePreviewedPage } from "../CamoxPreview";
import type { OverlayMessage } from "../overlayMessages";
import { previewStore } from "../previewStore";
import { BlockActionsPopover } from "./BlockActionsPopover";
import { useUpdateBlockPosition } from "./useUpdateBlockPosition";

/* -------------------------------------------------------------------------------------------------
 * useEmbedTitle
 * -----------------------------------------------------------------------------------------------*/

function useEmbedTitle(url: string | null) {
  const [title, setTitle] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!url) return;
    setTitle(null);
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((res) => res.text())
      .then((html) => {
        const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (match?.[1]) setTitle(match[1].trim());
      })
      .catch(() => {});
    return () => controller.abort();
  }, [url]);

  return title;
}

/* -------------------------------------------------------------------------------------------------
 * FieldItem
 * -----------------------------------------------------------------------------------------------*/

type FieldItemProps = {
  fieldName: string;
  value: unknown;
  fieldType: string | undefined;
  schemaTitle: string | undefined;
  arrayItemType?: string;
  isSelected: boolean;
  onFieldClick: () => void;
  onFieldDoubleClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

const FieldItem = ({
  fieldName,
  value,
  fieldType,
  schemaTitle,
  arrayItemType,
  isSelected,
  onFieldClick,
  onFieldDoubleClick,
  onMouseEnter,
  onMouseLeave,
}: FieldItemProps) => {
  const embedUrl = fieldType === "Embed" ? (value as string) : null;
  const fetchedEmbedTitle = useEmbedTitle(embedUrl);

  const fieldDef =
    fieldType != null ? fieldTypesDictionary[fieldType as keyof typeof fieldTypesDictionary] : null;
  const displayValue = fieldDef
    ? fieldDef.getLabel(value, {
        schemaTitle,
        fieldName,
        fetchedTitle: fetchedEmbedTitle,
      })
    : JSON.stringify(value);

  const FieldIcon = fieldDef?.getIcon({ arrayItemType }) ?? Type;

  return (
    <li
      className={cn(
        "flex items-center gap-1.5 rounded-lg pl-2 pr-1 py-2 cursor-default group/field",
        isSelected ? "bg-accent" : "hover:bg-accent/75",
      )}
      onClick={() => fieldType && onFieldClick()}
      onDoubleClick={() => fieldType && onFieldDoubleClick()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <FieldIcon className="size-4 shrink-0" />
      <span className="text-accent-foreground truncate select-none">{displayValue}</span>
    </li>
  );
};

/* -------------------------------------------------------------------------------------------------
 * BlockFields
 * -----------------------------------------------------------------------------------------------*/

type BlockFieldsProps = {
  block: NormalizedBlock;
};

const BlockFields = ({ block }: BlockFieldsProps) => {
  const camoxApp = useCamoxApp();
  const blockDef = camoxApp.getBlockById(block.type);
  const schemaProperties = blockDef?._internal.contentSchema.properties;

  const selection = useSelector(previewStore, (state) => state.context.selection);
  const iframeElement = useSelector(previewStore, (state) => state.context.iframeElement);
  const { data: blockBundle } = useQuery(blockQueries.get(block.id));

  let selectedFieldName: string | null = null;
  if (selection?.type === "block-field" && selection.blockId === block.id) {
    selectedFieldName = selection.fieldName;
  } else if (
    (selection?.type === "item" || selection?.type === "item-field") &&
    selection.blockId === block.id &&
    blockBundle
  ) {
    const itemsById = new Map(blockBundle.repeatableItems.map((i) => [i.id, i]));
    let current = itemsById.get(selection.itemId);
    while (current?.parentItemId != null) {
      current = itemsById.get(current.parentItemId);
    }
    selectedFieldName = current?.fieldName ?? null;
  }

  const handleFieldClick = (fieldName: string, fieldType: string) => {
    previewStore.send({
      type: "selectBlockField",
      blockId: block.id,
      fieldName,
      fieldType: fieldType as "String" | "RepeatableItem",
    });
  };

  const handleFieldDoubleClick = (fieldName: string, fieldType: string) => {
    const fieldDef = fieldTypesDictionary[fieldType as keyof typeof fieldTypesDictionary];
    fieldDef.onTreeDoubleClick({ blockId: block.id, fieldName });
  };

  const handleFieldMouseEnter = (fieldName: string, isRepeatable: boolean) => {
    if (!iframeElement?.contentWindow) return;
    if (isRepeatable) {
      const message: OverlayMessage = {
        type: "CAMOX_HOVER_REPEATER",
        blockId: String(block.id),
        fieldName,
      };
      iframeElement.contentWindow.postMessage(message, "*");
    } else {
      const fieldId = `${String(block.id)}__${fieldName}`;
      const message: OverlayMessage = {
        type: "CAMOX_HOVER_FIELD",
        fieldId,
      };
      iframeElement.contentWindow.postMessage(message, "*");
    }
  };

  const handleFieldMouseLeave = (fieldName: string, isRepeatable: boolean) => {
    if (!iframeElement?.contentWindow) return;
    if (isRepeatable) {
      const message: OverlayMessage = {
        type: "CAMOX_HOVER_REPEATER_END",
        blockId: String(block.id),
        fieldName,
      };
      iframeElement.contentWindow.postMessage(message, "*");
    } else {
      const fieldId = `${String(block.id)}__${fieldName}`;
      const message: OverlayMessage = {
        type: "CAMOX_HOVER_FIELD_END",
        fieldId,
      };
      iframeElement.contentWindow.postMessage(message, "*");
    }
  };

  return (
    <ul className="my-1 space-y-1 pl-7">
      {Object.keys(schemaProperties ?? {}).map((fieldName) => {
        const value = block.content[fieldName];
        const fieldSchema = schemaProperties?.[fieldName];
        if (!fieldSchema) return null;
        const fieldType = fieldSchema.fieldType;
        const isRepeatable = fieldType === "RepeatableItem";
        return (
          <FieldItem
            key={fieldName}
            fieldName={fieldName}
            value={value}
            fieldType={fieldType}
            schemaTitle={fieldSchema?.title}
            arrayItemType={fieldSchema?.arrayItemType}
            isSelected={selectedFieldName === fieldName}
            onFieldClick={() => handleFieldClick(fieldName, fieldType!)}
            onFieldDoubleClick={() => handleFieldDoubleClick(fieldName, fieldType!)}
            onMouseEnter={() => handleFieldMouseEnter(fieldName, isRepeatable)}
            onMouseLeave={() => handleFieldMouseLeave(fieldName, isRepeatable)}
          />
        );
      })}
    </ul>
  );
};

/* -------------------------------------------------------------------------------------------------
 * useBlockTreeItem
 * -----------------------------------------------------------------------------------------------*/

function useBlockTreeItem(block: NormalizedBlock, isDragging = false) {
  const [ellipsisPopoverOpen, setEllipsisPopoverOpen] = React.useState(false);
  const selection = useSelector(previewStore, (state) => state.context.selection);
  const iframeElement = useSelector(previewStore, (state) => state.context.iframeElement);
  const isBlockSelected = selection?.type === "block" && selection.blockId === block.id;
  const shouldShowHover = !isDragging && !isBlockSelected;
  const shouldShowActive = isDragging || isBlockSelected;

  const handleBlockMouseEnter = () => {
    if (!iframeElement?.contentWindow) return;
    const message: OverlayMessage = {
      type: "CAMOX_HOVER_BLOCK",
      blockId: String(block.id),
    };
    iframeElement.contentWindow.postMessage(message, "*");
  };

  const handleBlockMouseLeave = () => {
    if (!iframeElement?.contentWindow) return;
    const message: OverlayMessage = {
      type: "CAMOX_HOVER_BLOCK_END",
      blockId: String(block.id),
    };
    iframeElement.contentWindow.postMessage(message, "*");
  };

  const toggleSelection = () => {
    if (isBlockSelected) {
      previewStore.send({ type: "clearSelection" });
    } else {
      previewStore.send({
        type: "setFocusedBlock",
        blockId: block.id,
      });
    }
  };

  return {
    ellipsisPopoverOpen,
    setEllipsisPopoverOpen,
    shouldShowHover,
    shouldShowActive,
    handleBlockMouseEnter,
    handleBlockMouseLeave,
    toggleSelection,
  };
}

/* -------------------------------------------------------------------------------------------------
 * BlockTreeItem sub-components
 * -----------------------------------------------------------------------------------------------*/

const BlockTreeItemHeader = ({
  children,
  shouldShowHover,
  shouldShowActive,
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<"div"> & {
  shouldShowHover: boolean;
  shouldShowActive: boolean;
}) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-row justify-between items-center gap-1 px-1 max-w-full rounded-lg text-foreground transition-all hover:transition-none",
      shouldShowHover && "hover:bg-accent/75",
      shouldShowActive && "bg-accent text-accent-foreground",
      "data-open:rounded-b-none",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

const BlockTreeItemTrigger = ({
  displayText,
  onClick,
}: {
  displayText: string;
  onClick: () => void;
}) => (
  <div className="flex flex-1 items-center gap-1 overflow-x-hidden">
    <Accordion.Trigger
      className={cn(
        "cursor-default flex-1 truncate py-2 text-sm text-left rounded-sm",
        "focus-visible:underline outline-none focus-visible:decoration-ring/50 focus-visible:decoration-4",
      )}
      title={displayText}
      onClick={onClick}
    >
      {displayText}
    </Accordion.Trigger>
  </div>
);

const BlockTreeItemEllipsis = ({
  open,
  className,
  ...props
}: React.ComponentPropsWithRef<typeof Button> & { open: boolean }) => (
  <Button
    variant="ghost"
    size="icon-sm"
    className={cn(
      "text-muted-foreground hover:text-foreground",
      open ? "flex" : "hidden group-hover:flex group-focus-within:flex",
      className,
    )}
    {...props}
  >
    <Ellipsis className="size-4" />
  </Button>
);

const BlockTreeItemContent = ({ block }: { block: NormalizedBlock }) => (
  <Accordion.Panel className="text-muted-foreground h-[var(--accordion-panel-height)] overflow-hidden rounded-b-lg text-sm transition-[height] duration-200 data-[ending-style]:h-0 data-[starting-style]:h-0">
    <BlockFields block={block} />
  </Accordion.Panel>
);

/* -------------------------------------------------------------------------------------------------
 * SortableBlock
 * -----------------------------------------------------------------------------------------------*/

interface SortableBlockProps {
  block: NormalizedBlock;
}

const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, wasDragging } = args;
  if (isSorting || wasDragging) return false;
  return defaultAnimateLayoutChanges(args);
};

const SortableBlock = ({ block }: SortableBlockProps) => {
  const [gripPopoverOpen, setGripPopoverOpen] = React.useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(block.id),
    animateLayoutChanges,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };
  const ctx = useBlockTreeItem(block, isDragging);
  const isBlockFocused = useSelector(
    previewStore,
    (state) => state.context.selection?.blockId === block.id,
  );

  return (
    <Accordion.Root value={isBlockFocused ? [String(block.id)] : []}>
      <Accordion.Item
        value={String(block.id)}
        ref={setNodeRef}
        style={style}
        className="group"
        onMouseEnter={ctx.handleBlockMouseEnter}
        onMouseLeave={ctx.handleBlockMouseLeave}
      >
        <Accordion.Header render={<div />}>
          <BlockTreeItemHeader
            shouldShowHover={ctx.shouldShowHover}
            shouldShowActive={ctx.shouldShowActive}
          >
            <BlockActionsPopover
              block={block}
              open={gripPopoverOpen}
              onOpenChange={setGripPopoverOpen}
            >
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground flex cursor-grab active:cursor-grabbing"
                {...attributes}
                {...listeners}
              >
                <span className="sr-only">Click and use arrow keys to reorder</span>
                <GripVertical className="h-4 w-4" />
              </Button>
            </BlockActionsPopover>
            <BlockTreeItemTrigger
              displayText={block.summary || block.type}
              onClick={ctx.toggleSelection}
            />
            <BlockActionsPopover
              block={block}
              open={ctx.ellipsisPopoverOpen}
              onOpenChange={ctx.setEllipsisPopoverOpen}
            >
              <BlockTreeItemEllipsis open={ctx.ellipsisPopoverOpen} />
            </BlockActionsPopover>
          </BlockTreeItemHeader>
        </Accordion.Header>
        <BlockTreeItemContent block={block} />
      </Accordion.Item>
    </Accordion.Root>
  );
};

/* -------------------------------------------------------------------------------------------------
 * LayoutBlockItem
 * -----------------------------------------------------------------------------------------------*/

interface LayoutBlockItemProps {
  block: NormalizedBlock;
  layoutName: string;
}

const LayoutBlockItem = ({ block, layoutName }: LayoutBlockItemProps) => {
  const camoxApp = useCamoxApp();
  const blockDef = camoxApp.getBlockById(block.type);
  const ctx = useBlockTreeItem(block);
  const displayText = blockDef?._internal.title ?? block.type;
  const isBlockFocused = useSelector(
    previewStore,
    (state) => state.context.selection?.blockId === block.id,
  );

  return (
    <Accordion.Root value={isBlockFocused ? [String(block.id)] : []}>
      <Accordion.Item
        value={String(block.id)}
        className="group"
        onMouseEnter={ctx.handleBlockMouseEnter}
        onMouseLeave={ctx.handleBlockMouseLeave}
      >
        <Accordion.Header render={<div />}>
          <BlockTreeItemHeader
            shouldShowHover={ctx.shouldShowHover}
            shouldShowActive={ctx.shouldShowActive}
          >
            <div className="text-muted-foreground flex size-7 shrink-0 items-center justify-center">
              <Tooltip>
                <TooltipTrigger>
                  <LayoutTemplate className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent>
                  From <span className="font-semibold">{layoutName}</span> layout.
                  <br />
                  Changing the content may affect other pages
                </TooltipContent>
              </Tooltip>
            </div>
            <BlockTreeItemTrigger displayText={displayText} onClick={ctx.toggleSelection} />
            <BlockActionsPopover
              block={block}
              open={ctx.ellipsisPopoverOpen}
              onOpenChange={ctx.setEllipsisPopoverOpen}
              isLayoutBlock
              layoutPlacement={block.placement as "before" | "after"}
            >
              <BlockTreeItemEllipsis open={ctx.ellipsisPopoverOpen} />
            </BlockActionsPopover>
          </BlockTreeItemHeader>
        </Accordion.Header>
        <BlockTreeItemContent block={block} />
      </Accordion.Item>
    </Accordion.Root>
  );
};

/* -------------------------------------------------------------------------------------------------
 * PageTree
 * -----------------------------------------------------------------------------------------------*/

const PageTree = () => {
  const page = usePreviewedPage();
  const {
    pageBlocks,
    beforeBlocks: layoutBeforeBlocks,
    afterBlocks: layoutAfterBlocks,
  } = usePageBlocks(page);
  const camoxApp = useCamoxApp();

  const updatePosition = useUpdateBlockPosition();
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
        delay: 150,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id || !page) {
      setActiveId(null);
      return;
    }

    // Find the old and new indices
    const oldIndex = pageBlocks.findIndex((block) => String(block.id) === active.id);
    const newIndex = pageBlocks.findIndex((block) => String(block.id) === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      setActiveId(null);
      return;
    }

    // Determine afterPosition and beforePosition based on new index
    // When dragging down (oldIndex < newIndex), the block is inserted after newIndex
    // When dragging up (oldIndex > newIndex), the block is inserted before newIndex
    let afterPosition: string | undefined;
    let beforePosition: string | undefined;

    if (oldIndex < newIndex) {
      // Dragging down: insert after the target position
      afterPosition = pageBlocks[newIndex].position;
      beforePosition =
        newIndex < pageBlocks.length - 1 ? pageBlocks[newIndex + 1].position : undefined;
    } else {
      // Dragging up: insert before the target position
      afterPosition = newIndex > 0 ? pageBlocks[newIndex - 1].position : undefined;
      beforePosition = pageBlocks[newIndex].position;
    }

    // mutate() triggers onMutate synchronously, reordering the list
    // before dnd-kit resets transforms on neighboring items
    updatePosition.mutate({
      id: Number(active.id),
      afterPosition,
      beforePosition,
    });
    setActiveId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  if (!page) {
    return null;
  }

  const layout = page.layout ? camoxApp.getLayoutById(page.layout.layoutId) : undefined;

  return (
    <>
      <div className="flex flex-col gap-0.5">
        {layoutBeforeBlocks.map((block) => (
          <LayoutBlockItem
            key={String(block.id)}
            block={block}
            layoutName={layout?._internal.title ?? "Unknown"}
          />
        ))}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext
            items={pageBlocks.map((block) => String(block.id))}
            strategy={verticalListSortingStrategy}
          >
            {pageBlocks.map((block) => (
              <SortableBlock key={String(block.id)} block={block} />
            ))}
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {activeId
              ? (() => {
                  const activeBlock = pageBlocks.find((b) => String(b.id) === activeId);
                  if (!activeBlock) return null;
                  return (
                    <div className="bg-accent text-accent-foreground rounded-lg shadow-md">
                      <div className="flex items-center gap-1 px-1 py-2 text-sm">
                        <GripVertical className="text-muted-foreground mx-1.5 h-4 w-4" />
                        <span className="truncate">{activeBlock.summary}</span>
                      </div>
                    </div>
                  );
                })()
              : null}
          </DragOverlay>
        </DndContext>
        {layoutAfterBlocks.map((block) => (
          <LayoutBlockItem
            key={String(block.id)}
            block={block}
            layoutName={layout?._internal.title ?? "Unknown"}
          />
        ))}
      </div>
      <Button
        variant="secondary"
        onClick={() =>
          previewStore.send({
            type: "openAddBlockSheet",
          })
        }
      >
        <Plus />
        Add block
      </Button>
    </>
  );
};

export { PageTree };
