import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: { options: { typeAware: true, typeCheck: true } },
  staged: {
    "*": ["vp fmt", "nx affected -t check"],
  },
  fmt: {
    ignorePatterns: [],
    sortImports: {},
    sortTailwindcss: {},
  },
});
