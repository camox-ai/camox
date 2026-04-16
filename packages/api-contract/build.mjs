import { execSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });

// Emit JS + .d.ts for query-keys (runtime values)
execSync("pnpm exec tsc -p tsconfig.build.json", { stdio: "inherit" });

// Bundle Router .d.ts (inlines all transitive types from the api app)
execSync(
  "pnpm exec dts-bundle-generator --no-check --project tsconfig.json src/index.ts -o dist/index.d.ts",
  { stdio: "inherit" },
);

// index.js is empty — Router is a type-only export
writeFileSync("dist/index.js", "// type-only module\n");
