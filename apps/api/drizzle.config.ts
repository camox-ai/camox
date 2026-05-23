import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "drizzle-kit";

function getLocalD1Db(): string {
  const configDir = path.dirname(fileURLToPath(import.meta.url));
  const candidateDirs = [
    path.resolve(configDir, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject"),
    path.resolve(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject"),
  ];

  for (const d1Dir of new Set(candidateDirs)) {
    if (!fs.existsSync(d1Dir)) continue;

    const files = fs
      .readdirSync(d1Dir)
      .filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");

    if (files.length === 0) continue;

    return path.join(d1Dir, files[0]);
  }

  return "";
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: getLocalD1Db(),
  },
});
