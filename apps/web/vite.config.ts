import { cloudflare } from "@cloudflare/vite-plugin";
import babelPlugin from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { camox } from "camox/vite";
import { defineConfig, loadEnv } from "vite-plus";

const env = loadEnv(process.env.NODE_ENV!, process.cwd(), "CAMOX_");

const config = defineConfig({
  lint: {
    plugins: ["react"],
    rules: {
      "no-nested-ternary": "error",
    },
    ignorePatterns: ["src/routeTree.gen.ts"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart(),
    react(),
    babelPlugin({ presets: [reactCompilerPreset()] }),
    camox({ projectSlug: "camox-landing", syncSecret: env.CAMOX_SYNC_SECRET }),
  ],
  optimizeDeps: {
    include: ["@paper-design/shaders-react", "@daveyplate/better-auth-ui"],
  },
});

export default config;
