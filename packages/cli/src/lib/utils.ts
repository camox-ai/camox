import fs from "node:fs";
import path from "node:path";

export type PackageManager = "pnpm" | "bun" | "npm" | "yarn";

export const pmCommands: Record<PackageManager, { install: string; dev: string }> = {
  pnpm: { install: "pnpm install", dev: "pnpm dev" },
  bun: { install: "bun install", dev: "bun dev" },
  npm: { install: "npm install", dev: "npm run dev" },
  yarn: { install: "yarn install", dev: "yarn dev" },
};

export function copyDir(src: string, dest: string, replacements: Record<string, string>) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
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
