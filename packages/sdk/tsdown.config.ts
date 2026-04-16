import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import pluginBabel from "@rollup/plugin-babel";
import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";
import { defineConfig } from "tsdown";

/**
 * Rolldown plugin to handle `?inline` CSS imports.
 * Resolves the CSS file, processes it through PostCSS (for Tailwind),
 * and returns the result as an exported JS string.
 */
function cssInlinePlugin() {
  return {
    name: "css-inline",
    resolveId(id: string, importer: string | undefined) {
      if (!id.endsWith(".css?inline") || !importer) return;
      const cssPath = resolve(dirname(importer), id.replace("?inline", ""));
      return { id: cssPath + "?inline", external: false };
    },
    async load(id: string) {
      if (!id.endsWith(".css?inline")) return;
      const cssPath = id.slice(0, -"?inline".length);
      const css = readFileSync(cssPath, "utf-8");
      const result = await postcss([tailwindcss()]).process(css, { from: cssPath });
      return `export default ${JSON.stringify(result.css)};`;
    },
  };
}

export default defineConfig({
  entry: {
    "core/createApp": "src/core/createApp.ts",
    "core/createBlock": "src/core/createBlock.tsx",
    "core/createLayout": "src/core/createLayout.tsx",
    "features/preview/CamoxPreview": "src/features/preview/CamoxPreview.tsx",
    "features/content/CamoxContent": "src/features/content/CamoxContent.tsx",
    "features/provider/CamoxProvider": "src/features/provider/CamoxProvider.tsx",
    "features/studio/CamoxStudio": "src/features/studio/CamoxStudio.tsx",
    "features/vite/vite": "src/features/vite/vite.ts",
    "features/metadata/sitemap": "src/features/metadata/sitemap.ts",
    "features/routes/pageRoute": "src/features/routes/pageRoute.tsx",
    "features/routes/ogRoute": "src/features/routes/ogRoute.ts",
  },
  format: "esm",
  outDir: "dist",
  clean: true,
  unbundle: true,
  dts: false,
  minify: false,
  outExtensions: () => ({ js: ".js" }),
  deps: {
    skipNodeModulesBundle: true,
  },
  plugins: [
    cssInlinePlugin(),
    pluginBabel({
      babelHelpers: "bundled",
      parserOpts: {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      },
      plugins: ["babel-plugin-react-compiler"],
      extensions: [".js", ".jsx", ".ts", ".tsx"],
      exclude: /node_modules/,
    }),
  ],
});
