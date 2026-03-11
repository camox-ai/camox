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
    blocksMap.set(block.id, block);
  }

  for (const layout of layouts) {
    layoutsMap.set(layout.id, layout);
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
        blockId: block.id,
        title: block.title,
        description: block.description,
        contentSchema: block.contentSchema,
        settingsSchema: block.settingsSchema,
        layoutOnly: block.layoutOnly || undefined,
      }));
    },
    getSerializableLayoutDefinitions() {
      return Array.from(layoutsMap.values()).map((layout) => ({
        layoutId: layout.id,
        description: layout.description,
        blocks: layout.blockDefinitions,
      }));
    },
  };
}

export type CamoxApp = ReturnType<typeof createApp>;
