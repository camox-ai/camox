import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    rules: {
      "no-nested-ternary": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
