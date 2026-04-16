import pluginBabel from "@rollup/plugin-babel";
import { defineConfig } from "tsdown";

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
  dts: true,
  minify: false,
  outExtensions: () => ({ js: ".js" }),
  deps: {
    skipNodeModulesBundle: true,
    neverBundle: ["virtual:camox-studio-css", "virtual:camox-overlay-css"],
  },
  plugins: [
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
