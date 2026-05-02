import babelPlugin from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { camox } from "camox/vite";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite-plus";

const env = loadEnv(process.env.NODE_ENV!, process.cwd(), "CAMOX_");

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    nitro(),
    camox({
      projectSlug: "camox-template-default-01", // camox-cli:replace-slug
      syncSecret: env.CAMOX_SYNC_SECRET,
      // camox-cli:dev-only-start
      _internal: {
        authenticationUrl: "http://localhost:3274",
        apiUrl: "http://localhost:8787",
      },
      // camox-cli:dev-only-end
    }),
    tanstackStart(),
    react(),
    babelPlugin({ presets: [reactCompilerPreset()] }),
  ],
});
