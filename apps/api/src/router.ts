import { blockDefinitionProcedures } from "./routes/block-definitions";
import { blockProcedures } from "./routes/blocks";
import { fileProcedures } from "./routes/files";
import { layoutProcedures } from "./routes/layouts";
import { pageProcedures } from "./routes/pages";
import { projectProcedures } from "./routes/projects";
import { repeatableItemProcedures } from "./routes/repeatable-items";

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
