import babelPlugin from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { camox } from "camox/vite";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite-plus";

const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "CAMOX_");

const config = defineConfig({
  lint: {
    plugins: ["react"],
    rules: {
      "no-nested-ternary": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    nitro(),
    camox({
      projectSlug: "camox-landing",
      syncSecret: env.CAMOX_SYNC_SECRET,
    }),
    react(),
    babelPlugin({ presets: [reactCompilerPreset()] }),
  ],
  optimizeDeps: {
    include: ["@paper-design/shaders-react"],
  },
});

export default config;
