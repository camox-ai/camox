import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "drizzle-kit";

function getLocalD1Db(): string {
  const d1Dir = path.resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  if (!fs.existsSync(d1Dir)) return "";
  const files = fs.readdirSync(d1Dir).filter((f) => f.endsWith(".sqlite"));
  return files.length > 0 ? path.join(d1Dir, files[0]) : "";
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: getLocalD1Db(),
  },
});
