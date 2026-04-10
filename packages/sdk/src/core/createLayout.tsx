import * as React from "react";

/* -------------------------------------------------------------------------------------------------
 * createLayout
 * -----------------------------------------------------------------------------------------------*/

export interface OgImageParams {
  title: string;
  description: string;
  projectName: string;
}

export interface LayoutBlockData {
  _id: string;
  type: string;
  content: Record<string, unknown>;
  settings?: Record<string, unknown>;
  position: string;
}

/** Minimal block interface — avoids importing the full generic Block type. */
interface LayoutBlock {
  id: string;
  Component: React.ComponentType<{
    blockData: any;
    mode: "site" | "peek" | "layout";
    isFirstBlock?: boolean;
    showAddBlockTop?: boolean;
    showAddBlockBottom?: boolean;
    addBlockAfterPosition?: string | null;
  }>;
  getInitialBundle: () => {
    content: Record<string, unknown>;
    settings: Record<string, unknown>;
    repeatableItems: Array<{
      tempId: string;
      parentTempId: string | null;
      fieldName: string;
      content: Record<string, unknown>;
      position: string;
    }>;
  };
}

interface CreateLayoutOptions {
  id: string;
  title: string;
  description: string;
  blocks: { before: LayoutBlock[]; after: LayoutBlock[] };
  /** Ordered list of blocks to create on the initial page when a project is first set up. */
  initialBlocks?: LayoutBlock[];
  component: React.ComponentType<{ children: React.ReactNode }>;
  buildMetaTitle: (params: {
    pageMetaTitle: string;
    projectName: string;
    pageFullPath: string;
  }) => string;
  buildOgImage?: (params: OgImageParams) => React.ReactElement;
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

export function createLayout(options: CreateLayoutOptions) {
  // Each layout gets its own context — avoids cross-module identity issues
  const LayoutContext = React.createContext<{
    layoutBlocks: Record<string, LayoutBlockData>;
  } | null>(null);

  const allBlocks = [...options.blocks.before, ...options.blocks.after];

  // Build slot components keyed by PascalCase(block.id)
  const slotComponents: Record<string, React.ComponentType> = {};

  const lastBeforeBlock = options.blocks.before[options.blocks.before.length - 1];
  const firstAfterBlock = options.blocks.after[0];

  for (const block of allBlocks) {
    const isLastBefore = block === lastBeforeBlock;
    const isFirstAfter = block === firstAfterBlock;

    const SlotComponent = () => {
      const ctx = React.use(LayoutContext);
      if (!ctx) {
        throw new Error(
          `Layout slot "${block.id}" must be rendered inside a LayoutContextProvider`,
        );
      }

      const blockData = ctx.layoutBlocks[block.id];
      if (!blockData) return null;

      return (
        <block.Component
          blockData={blockData}
          mode="layout"
          showAddBlockTop={isFirstAfter || undefined}
          showAddBlockBottom={isLastBefore || undefined}
          addBlockAfterPosition={(() => {
            if (isLastBefore) return "";
            if (isFirstAfter) return null;
            return undefined;
          })()}
        />
      );
    };
    SlotComponent.displayName = `LayoutSlot(${toPascalCase(block.id)})`;
    slotComponents[toPascalCase(block.id)] = SlotComponent;
  }

  // Provider component that wraps the layout — shares context with slots
  const Provider = ({
    layoutBlocks,
    children,
  }: {
    layoutBlocks: Record<string, LayoutBlockData>;
    children: React.ReactNode;
  }) => {
    const value = React.useMemo(() => ({ layoutBlocks }), [layoutBlocks]);
    return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
  };

  // Build block definitions array for sync
  const blockDefinitions = [
    ...options.blocks.before.map((block) => {
      const bundle = block.getInitialBundle();
      return {
        type: block.id,
        content: bundle.content,
        settings: bundle.settings,
        repeatableItems: bundle.repeatableItems,
        placement: "before" as const,
      };
    }),
    ...options.blocks.after.map((block) => {
      const bundle = block.getInitialBundle();
      return {
        type: block.id,
        content: bundle.content,
        settings: bundle.settings,
        repeatableItems: bundle.repeatableItems,
        placement: "after" as const,
      };
    }),
  ];

  const buildOgImage = options.buildOgImage
    ? async (params: OgImageParams): Promise<Response> => {
        const { ImageResponse } = await import("@takumi-rs/image-response");
        const jsx = options.buildOgImage!(params);
        return new ImageResponse(jsx, { width: 1200, height: 630 });
      }
    : undefined;

  const initialBlockBundles = options.initialBlocks?.map((block) => {
    const bundle = block.getInitialBundle();
    return {
      type: block.id,
      content: bundle.content,
      settings: bundle.settings,
      repeatableItems: bundle.repeatableItems,
    };
  });

  return {
    id: options.id,
    title: options.title,
    description: options.description,
    buildMetaTitle: options.buildMetaTitle,
    buildOgImage,
    blockDefinitions,
    initialBlockBundles,
    component: options.component,
    Provider,
    blocks: slotComponents as Record<string, React.ComponentType>,
  };
}

export type Layout = ReturnType<typeof createLayout>;
