import { drizzle } from "drizzle-orm/d1";

import { aiJobs } from "./features/ai-jobs";
import { blockDefinitions } from "./features/block-definitions";
import { blocks } from "./features/blocks";
import { files } from "./features/files";
import { layouts } from "./features/layouts";
import { pages } from "./features/pages";
import { projects } from "./features/projects";
import { repeatableItems } from "./features/repeatable-items";

const schema = {
  projects,
  pages,
  layouts,
  blocks,
  repeatableItems,
  files,
  aiJobs,
  blockDefinitions,
};

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
