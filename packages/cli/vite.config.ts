import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts"],
    format: ["esm"],
    outDir: "dist",
    clean: true,
    banner: { js: "#!/usr/bin/env node" },
    dts: false,
    target: false,
  },
  lint: {
    ignorePatterns: ["templates/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
