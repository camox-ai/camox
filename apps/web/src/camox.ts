import { createApp } from 'camox/createApp';
import type { Block } from 'camox/createBlock';
import type { Layout } from 'camox/createLayout';

// Auto-import all blocks from the blocks directory
const blockModules = import.meta.glob<{ block: Block }>('./blocks/*.{ts,tsx}', {
  eager: true,
});
const blocks = Object.values(blockModules).map((mod) => mod.block);

// Auto-import all layouts from the layouts directory
const layoutModules = import.meta.glob<{ layout: Layout }>(
  './layouts/*.{ts,tsx}',
  { eager: true },
);
const layouts = Object.values(layoutModules).map((mod) => mod.layout);

export const camoxApp = createApp({
  blocks,
  layouts,
});
