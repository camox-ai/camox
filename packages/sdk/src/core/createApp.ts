import type { Block } from "./createBlock";
import type { Layout } from "./createLayout";

interface CreateAppOptions {
  blocks: Block[];
  layouts?: Layout[];
}

export function createApp({ blocks, layouts = [] }: CreateAppOptions) {
  const blocksMap = new Map<string, Block>();
  const layoutsMap = new Map<string, Layout>();

  for (const block of blocks) {
    blocksMap.set(block._internal.id, block);
  }

  for (const layout of layouts) {
    layoutsMap.set(layout._internal.id, layout);
  }

  // Validate that at most one layout defines initialBlocks
  const layoutsWithInitialBlocks = layouts.filter((l) => l._internal.initialBlockBundles);
  if (layoutsWithInitialBlocks.length > 1) {
    const ids = layoutsWithInitialBlocks.map((l) => `"${l._internal.id}"`).join(", ");
    throw new Error(
      `[camox] Only one layout can define initialBlocks, but found ${layoutsWithInitialBlocks.length}: ${ids}`,
    );
  }

  return {
    getBlocks() {
      return Array.from(blocksMap.values());
    },
    getBlockById(id: string) {
      return blocksMap.get(id);
    },
    getLayouts() {
      return Array.from(layoutsMap.values());
    },
    getLayoutById(id: string) {
      return layoutsMap.get(id);
    },
    getSerializableDefinitions() {
      return Array.from(blocksMap.values()).map((block) => ({
        blockId: block._internal.id,
        title: block._internal.title,
        description: block._internal.description,
        contentSchema: block._internal.contentSchema,
        settingsSchema: block._internal.settingsSchema,
        layoutOnly: block._internal.layoutOnly || undefined,
      }));
    },
    getSerializableLayoutDefinitions() {
      return Array.from(layoutsMap.values()).map((layout) => ({
        layoutId: layout._internal.id,
        description: layout._internal.description,
        blocks: layout._internal.blockDefinitions,
      }));
    },
    getInitialPageBundles() {
      const layout = layoutsWithInitialBlocks[0];
      if (layout) {
        return {
          layoutId: layout._internal.id,
          blocks: layout._internal.initialBlockBundles!,
          hasInitialBlocks: true,
        };
      }
      const fallback = layouts[0];
      if (!fallback) return null;
      return { layoutId: fallback._internal.id, blocks: [], hasInitialBlocks: false };
    },
  };
}

export type CamoxApp = ReturnType<typeof createApp>;
