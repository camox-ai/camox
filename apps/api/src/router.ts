import { blockDefinitionProcedures } from "./features/block-definitions";
import { blockProcedures } from "./features/blocks";
import { fileProcedures } from "./features/files";
import { layoutProcedures } from "./features/layouts";
import { pageProcedures } from "./features/pages";
import { projectProcedures } from "./features/projects";
import { repeatableItemProcedures } from "./features/repeatable-items";

export const router = {
  projects: projectProcedures,
  pages: pageProcedures,
  blocks: blockProcedures,
  layouts: layoutProcedures,
  files: fileProcedures,
  repeatableItems: repeatableItemProcedures,
  blockDefinitions: blockDefinitionProcedures,
};

export type Router = typeof router;
