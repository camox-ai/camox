import { cloudflare } from "@cloudflare/vite-plugin";
import babelPlugin from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { camox } from "camox/vite";
import { defineConfig, loadEnv } from "vite";

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "CAMOX_");

  return {
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
      exclude: ["@daveyplate/better-auth-ui"],
      include: ["@paper-design/shaders-react"],
    },
  };
});

export default config;
