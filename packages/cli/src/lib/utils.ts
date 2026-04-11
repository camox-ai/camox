import fs from "node:fs";
import path from "node:path";

export type PackageManager = "pnpm" | "bun" | "npm" | "yarn";

export const pmCommands: Record<PackageManager, { install: string; dev: string }> = {
  pnpm: { install: "pnpm install", dev: "pnpm dev" },
  bun: { install: "bun install", dev: "bun dev" },
  npm: { install: "npm install", dev: "npm run dev" },
  yarn: { install: "yarn install", dev: "yarn dev" },
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function detectPackageManager(): PackageManager | null {
  // 1. Check npm_config_user_agent (set by pnpm create, npx, bunx, yarn create)
  const userAgent = process.env.npm_config_user_agent;
  if (userAgent) {
    const name = userAgent.split("/")[0];
    if (name === "pnpm") return "pnpm";
    if (name === "bun") return "bun";
    if (name === "npm" || name === "npx") return "npm";
    if (name === "yarn") return "yarn";
  }

  // 2. Walk ancestor directories looking for lockfiles
  let dir = process.cwd();
  const root = path.parse(dir).root;
  while (true) {
    if (
      fs.existsSync(path.join(dir, "pnpm-lock.yaml")) ||
      fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))
    )
      return "pnpm";
    if (fs.existsSync(path.join(dir, "bun.lockb")) || fs.existsSync(path.join(dir, "bun.lock")))
      return "bun";
    if (fs.existsSync(path.join(dir, "package-lock.json"))) return "npm";
    if (fs.existsSync(path.join(dir, "yarn.lock"))) return "yarn";

    if (dir === root) break;
    dir = path.dirname(dir);
  }

  return null;
}

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
