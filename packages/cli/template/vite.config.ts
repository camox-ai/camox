import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { camox } from "camox/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    camox({ projectSlug: "{{projectSlug}}", syncSecret: "{{syncSecret}}" }),
    tanstackStart(),
    viteReact(),
  ],
});
