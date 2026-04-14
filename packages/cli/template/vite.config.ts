import babelPlugin from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { camox } from "camox/vite";
import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "CAMOX_");
  return {
    resolve: { tsconfigPaths: true },
    plugins: [
      tailwindcss(),
      camox({ projectSlug: "{{projectSlug}}", syncSecret: env.CAMOX_SYNC_SECRET }),
      tanstackStart(),
      react(),
      babelPlugin({ presets: [reactCompilerPreset()] }),
    ],
  };
});
