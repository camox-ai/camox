import fs from "node:fs";
import path from "node:path";

export type PackageManager = "pnpm" | "bun" | "npm";

export type PackageManagerCommand = {
  bin: string;
  args: string[];
  display: string;
  fallback?: {
    bin: string;
    args: string[];
  };
};

export const packageManagerVersions: Record<PackageManager, string> = {
  pnpm: "pnpm@11.1.3",
  bun: "bun@1.2.23",
  npm: "npm@11.6.2",
};

export const pmCommands: Record<
  PackageManager,
  { install: PackageManagerCommand; dev: PackageManagerCommand }
> = {
  pnpm: {
    install: {
      bin: "corepack",
      args: ["pnpm", "install"],
      display: "pnpm install",
      fallback: { bin: "pnpm", args: ["install"] },
    },
    dev: {
      bin: "corepack",
      args: ["pnpm", "dev"],
      display: "pnpm dev",
      fallback: { bin: "pnpm", args: ["dev"] },
    },
  },
  bun: {
    install: { bin: "bun", args: ["install"], display: "bun install" },
    dev: { bin: "bun", args: ["dev"], display: "bun dev" },
  },
  npm: {
    install: { bin: "npm", args: ["install"], display: "npm install" },
    dev: { bin: "npm", args: ["run", "dev"], display: "npm run dev" },
  },
};

export function copyDir(src: string, dest: string, replacements: Record<string, string>) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Use statSync to follow symlinks — entry.isDirectory() is false for
    // symlinks-to-dirs, which would otherwise fall through to readFileSync.
    const stats = fs.statSync(srcPath);
    if (stats.isDirectory()) {
      copyDir(srcPath, destPath, replacements);
      continue;
    }

    let content = fs.readFileSync(srcPath, "utf-8");
    for (const [key, value] of Object.entries(replacements)) {
      content = content.replaceAll(key, value);
    }
    fs.writeFileSync(destPath, content);
  }
}
